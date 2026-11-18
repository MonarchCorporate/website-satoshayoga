#!/usr/bin/env python3
"""Generate the MySQL/MariaDB schema and the server metadata from the exported
Supabase/Postgres schema (schema.json, produced by the migration export).

Usage: python3 -I scripts/gen_schema.py <schema.json> <out_dir>

Outputs:
  <out_dir>/schema.sql  - CREATE TABLE statements (idempotent: IF NOT EXISTS)
  <out_dir>/meta.json   - column types, keys, relations and translated RLS policies

No customer data is read or written by this script.
"""
import json
import re
import sys

src, out_dir = sys.argv[1], sys.argv[2]
s = json.load(open(src))

# --------------------------------------------------------------------------
# Column types
# --------------------------------------------------------------------------

def norm_type(c):
    udt, t = c["udt"], c["type"]
    if udt == "uuid":
        return "uuid"
    if udt in ("text", "varchar", "bpchar"):
        return "text"
    if udt == "timestamptz" or udt == "timestamp":
        return "timestamptz"
    if udt in ("int4", "int2", "int8"):
        return "int"
    if udt == "numeric":
        return "numeric"
    if udt == "bool":
        return "bool"
    if udt in ("jsonb", "json"):
        return "json"
    if udt == "date":
        return "date"
    if udt == "time":
        return "time"
    if udt == "_uuid":
        return "uuid[]"
    if udt == "_text":
        return "text[]"
    if t == "USER-DEFINED":
        return "enum"
    raise SystemExit(f"unmapped type {udt} {t} for {c['table']}.{c['column']}")


def norm_default(d):
    if d is None:
        return None
    d = d.strip()
    if d == "gen_random_uuid()":
        return {"kind": "uuid"}
    if d == "now()":
        return {"kind": "now"}
    if d in ("true", "false"):
        return {"kind": "literal", "value": d == "true"}
    if re.fullmatch(r"-?\d+(\.\d+)?", d):
        return {"kind": "literal", "value": float(d) if "." in d else int(d)}
    m = re.fullmatch(r"'(.*)'::(text|jsonb|[a-z_]+)", d, re.S)
    if m:
        val, cast = m.group(1).replace("''", "'"), m.group(2)
        if cast == "jsonb":
            return {"kind": "literal", "value": json.loads(val)}
        return {"kind": "literal", "value": val}
    if d == "'{}'::text[]" or d == "'{}'::uuid[]":
        return {"kind": "literal", "value": []}
    m = re.fullmatch(r"ARRAY\[(.*)\]", d)
    if m:
        return {"kind": "literal", "value": re.findall(r"'([^']*)'", m.group(1))}
    if d.startswith("nextval("):
        seq = re.search(r"'(?:public\.)?([a-z_]+)'", d).group(1)
        return {"kind": "sequence", "value": seq}
    raise SystemExit(f"unmapped default {d}")


tables = {}
for c in s["columns"]:
    t = tables.setdefault(c["table"], {"columns": {}, "pk": [], "unique": [], "fks": [], "indexes": [], "policies": []})
    t["columns"][c["column"]] = {
        "type": norm_type(c),
        "nullable": c["nullable"] == "YES",
        "default": norm_default(c["default"]),
    }

view_names = {v["name"] for v in s["views"]}
for v in view_names:
    tables.pop(v, None)

# --------------------------------------------------------------------------
# Constraints
# --------------------------------------------------------------------------

def cols(defn):
    return [x.strip().strip('"') for x in defn.split(",")]

for c in s["constraints"]:
    t = tables.get(c["table"])
    if t is None:
        continue
    d = c["def"]
    if c["type"] == "p":
        t["pk"] = cols(re.search(r"PRIMARY KEY \((.*?)\)", d).group(1))
    elif c["type"] == "u":
        t["unique"].append(cols(re.search(r"UNIQUE \((.*?)\)", d).group(1)))
    elif c["type"] == "f":
        m = re.search(r"FOREIGN KEY \((.*?)\) REFERENCES ([\w.]+)\((.*?)\)(.*)", d)
        ref = m.group(2)
        ref = "auth_users" if ref == "auth.users" else ref.replace("public.", "")
        on_delete = re.search(r"ON DELETE (CASCADE|SET NULL|RESTRICT)", m.group(4))
        t["fks"].append({
            "name": c["name"],
            "columns": cols(m.group(1)),
            "refTable": ref,
            "refColumns": cols(m.group(3)),
            "onDelete": on_delete.group(1) if on_delete else "NO ACTION",
        })

for i in s["indexes"]:
    t = tables.get(i["table"])
    if t is None or "pkey" in i["name"] or "UNIQUE" in i["def"]:
        continue
    m = re.search(r"USING btree \((.*?)\)", i["def"])
    if not m:
        continue
    t["indexes"].append({"name": i["name"], "columns": [x.split()[0] for x in m.group(1).split(",")]})

# Unique indexes that are not constraints (e.g. partial unique on email_templates.trigger_key)
for i in s["indexes"]:
    t = tables.get(i["table"])
    if t is None or "UNIQUE" not in i["def"] or "pkey" in i["name"]:
        continue
    m = re.search(r"USING btree \((\w+(?:, \w+)*)\)", i["def"])
    if not m:
        continue  # functional index (lower(code)) -> enforced in application code
    u = cols(m.group(1))
    if u not in t["unique"]:
        t["unique"].append(u)

# --------------------------------------------------------------------------
# RLS policies -> MySQL WHERE templates
# Placeholders resolved per request by the server:
#   @uid            -> quoted current user id or NULL
#   @role_<name>    -> 1 / 0
#   @trainer_id     -> quoted trainer id of current user or NULL
#   @now            -> UTC_TIMESTAMP(6)
# --------------------------------------------------------------------------

def translate(expr):
    if expr is None:
        return None
    e = expr
    e = re.sub(r"has_role\(auth\.uid\(\), '(\w+)'::app_role\)", r"(@role_\1 = 1)", e)
    e = re.sub(r"user_has_course_booking\(auth\.uid\(\), id\)",
               "EXISTS (SELECT 1 FROM bookings _b WHERE _b.user_id = @uid AND _b.course_id = courses.id)", e)
    e = re.sub(r"has_active_video_access\(auth\.uid\(\), course_id\)",
               "EXISTS (SELECT 1 FROM video_course_access _a WHERE _a.user_id = @uid AND _a.course_id = video_lessons.course_id AND ("
               "_a.status = 'active' OR (_a.status = 'grace' AND _a.grace_until IS NOT NULL AND _a.grace_until > @now) OR "
               "(_a.status = 'cancelled' AND _a.current_period_end IS NOT NULL AND _a.current_period_end > @now)))", e)
    e = e.replace("current_trainer_id()", "@trainer_id")
    e = e.replace("auth.uid()", "@uid")
    e = re.sub(r"::(text|app_role|numeric|uuid)", "", e)
    if re.search(r"\b[a-z_]+\(", e.replace("EXISTS (", "").replace("ANY (", "")):
        # Remaining function calls would not work in MySQL - fail loudly.
        leftovers = re.findall(r"\b([a-z_]+)\(", e)
        bad = [x for x in leftovers if x.lower() not in ("exists", "any")]
        if bad:
            raise SystemExit(f"untranslated function in policy: {expr}")
    return re.sub(r"\s+", " ", e).strip()


storage_policies = []
for p in s["policies"]:
    roles = p["roles"]
    if isinstance(roles, str):
        roles = roles.strip("{}").split(",")
    pol = {
        "name": p["policyname"],
        "cmd": p["cmd"],
        "roles": roles,
        "using": translate(p["qual"]),
        "check": translate(p["with_check"]),
    }
    if p["schemaname"] == "storage":
        storage_policies.append(pol)
    elif p["tablename"] in tables:
        tables[p["tablename"]]["policies"].append(pol)

# --------------------------------------------------------------------------
# Tables added after the migration away from Supabase (not in the Postgres export)
# --------------------------------------------------------------------------
tables["waitlist_entries"] = {
    "columns": {
        "id": {"type": "uuid", "nullable": False, "default": {"kind": "uuid"}},
        "course_id": {"type": "uuid", "nullable": False, "default": None},
        "user_id": {"type": "uuid", "nullable": False, "default": None},
        # waiting -> notified (a seat became free, e-mail sent) -> booked; removed by customer/admin = row deleted
        "status": {"type": "text", "nullable": False, "default": {"kind": "literal", "value": "waiting"}},
        "created_at": {"type": "timestamptz", "nullable": False, "default": {"kind": "now"}},
        "notified_at": {"type": "timestamptz", "nullable": True, "default": None},
        "updated_at": {"type": "timestamptz", "nullable": False, "default": {"kind": "now"}},
    },
    "pk": ["id"],
    "unique": [["course_id", "user_id"]],
    "fks": [
        {"name": "waitlist_entries_course_id_fkey", "columns": ["course_id"], "refTable": "courses", "refColumns": ["id"], "onDelete": "CASCADE"},
        {"name": "waitlist_entries_user_id_fkey", "columns": ["user_id"], "refTable": "auth_users", "refColumns": ["id"], "onDelete": "CASCADE"},
    ],
    "indexes": [{"name": "idx_waitlist_course_status", "columns": ["course_id", "status"]}],
    "policies": [
        {"name": "Admins manage waitlist", "cmd": "ALL", "roles": ["authenticated"], "using": "(@role_admin = 1)", "check": "(@role_admin = 1)"},
        {"name": "Staff view waitlist", "cmd": "SELECT", "roles": ["authenticated"], "using": "(@role_staff = 1)", "check": None},
        {"name": "Staff remove waitlist entries", "cmd": "DELETE", "roles": ["authenticated"], "using": "(@role_staff = 1)", "check": None},
        {"name": "Trainers view waitlist of own courses", "cmd": "SELECT", "roles": ["authenticated"],
         "using": "(EXISTS ( SELECT 1 FROM courses c WHERE ((c.id = waitlist_entries.course_id) AND (c.instructor_id = @trainer_id))))", "check": None},
        {"name": "Users view own waitlist entries", "cmd": "SELECT", "roles": ["authenticated"], "using": "(@uid = user_id)", "check": None},
        {"name": "Users join waitlist", "cmd": "INSERT", "roles": ["authenticated"], "using": None, "check": "(@uid = user_id)"},
        {"name": "Users leave waitlist", "cmd": "DELETE", "roles": ["authenticated"], "using": "(@uid = user_id)", "check": None},
    ],
}

# --------------------------------------------------------------------------
# Views (exposed as derived tables, readable by everybody like in Supabase)
# --------------------------------------------------------------------------
views = {
    "public_trainers": {
        "sql": "SELECT id, first_name, last_name FROM trainers WHERE is_active = 1",
        "columns": {"id": "uuid", "first_name": "text", "last_name": "text"},
    },
    "video_lessons_public": {
        "sql": "SELECT l.id, l.course_id, l.title, l.description, l.provider, l.duration_seconds, l.sort_order, "
               "l.is_free_preview, l.created_at FROM video_lessons l JOIN video_courses c ON c.id = l.course_id "
               "WHERE c.is_published = 1 OR @role_admin = 1",
        "columns": {"id": "uuid", "course_id": "uuid", "title": "text", "description": "text", "provider": "enum",
                    "duration_seconds": "int", "sort_order": "int", "is_free_preview": "bool", "created_at": "timestamptz"},
    },
}
assert view_names == set(views), view_names

# --------------------------------------------------------------------------
# MySQL DDL
# --------------------------------------------------------------------------

def indexed_cols(t):
    out = set(t["pk"])
    for u in t["unique"]:
        out.update(u)
    for f in t["fks"]:
        out.update(f["columns"])
    for i in t["indexes"]:
        out.update(i["columns"])
    return out


def mysql_type(name, col, indexed):
    ty = col["type"]
    return {
        "uuid": "CHAR(36) CHARACTER SET ascii COLLATE ascii_bin",
        "text": "VARCHAR(255)" if indexed else "LONGTEXT",
        "enum": "VARCHAR(64)",
        "timestamptz": "DATETIME(6)",
        "int": "INT",
        "numeric": "DECIMAL(14,4)",
        "bool": "TINYINT(1)",
        "json": "JSON",
        "uuid[]": "JSON",
        "text[]": "JSON",
        "date": "DATE",
        "time": "TIME",
    }[ty]



def default_sql(col):
    d = col["default"]
    if not d:
        return ""
    if d["kind"] == "now":
        return " DEFAULT CURRENT_TIMESTAMP(6)" if col["type"] == "timestamptz" else ""
    if d["kind"] != "literal":
        return ""
    v = d["value"]
    if isinstance(v, bool):
        return f" DEFAULT {1 if v else 0}"
    if isinstance(v, (int, float)):
        return f" DEFAULT {v}"
    if isinstance(v, (list, dict)):
        return " DEFAULT ('" + json.dumps(v).replace("'", "''") + "')"
    return " DEFAULT ('" + str(v).replace("'", "''") + "')"

ddl = [
    "SET NAMES utf8mb4;",
    "SET time_zone = '+00:00';",
    """CREATE TABLE IF NOT EXISTS auth_users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  email VARCHAR(255) NULL,
  encrypted_password VARCHAR(255) NULL,
  email_confirmed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  last_sign_in_at DATETIME(6) NULL,
  raw_user_meta_data JSON NULL,
  raw_app_meta_data JSON NULL,
  phone VARCHAR(64) NULL,
  banned_until DATETIME(6) NULL,
  deleted_at DATETIME(6) NULL,
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY auth_users_email_key (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    """CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  KEY auth_refresh_tokens_user (user_id),
  CONSTRAINT auth_refresh_tokens_user_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    """CREATE TABLE IF NOT EXISTS auth_one_time_tokens (
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_type VARCHAR(32) NOT NULL,
  redirect_to LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6) NULL,
  KEY auth_ott_user (user_id),
  CONSTRAINT auth_ott_user_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    """CREATE TABLE IF NOT EXISTS storage_objects (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  bucket_id VARCHAR(64) NOT NULL,
  name VARCHAR(512) NOT NULL,
  owner CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY storage_objects_bucket_name (bucket_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    """CREATE TABLE IF NOT EXISTS app_sequences (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  value BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    """CREATE TABLE IF NOT EXISTS app_kv (
  k VARCHAR(128) NOT NULL PRIMARY KEY,
  v LONGTEXT NULL,
  updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
]

# Create tables in FK dependency order
order, seen = [], set()

def visit(name, stack=()):
    if name in seen or name == "auth_users":
        return
    if name in stack:
        raise SystemExit(f"FK cycle at {name}")
    for f in tables[name]["fks"]:
        if f["refTable"] != name:
            visit(f["refTable"], stack + (name,))
    seen.add(name)
    order.append(name)

for n in sorted(tables):
    visit(n)

for n in order:
    t = tables[n]
    idx = indexed_cols(t)
    lines = []
    for cname, col in t["columns"].items():
        line = f"  `{cname}` {mysql_type(cname, col, cname in idx)}"
        line += " NULL" if col["nullable"] else " NOT NULL"
        line += default_sql(col)
        lines.append(line)
    lines.append(f"  PRIMARY KEY ({', '.join('`%s`' % c for c in t['pk'])})")
    for u in t["unique"]:
        kname = f"{n}_{'_'.join(u)}_uq"
        if len(kname) > 60:
            import hashlib
            kname = kname[:50] + "_" + hashlib.md5(kname.encode()).hexdigest()[:8]
        lines.append(f"  UNIQUE KEY `{kname}` ({', '.join('`%s`' % c for c in u)})")
    for i in t["indexes"]:
        lines.append(f"  KEY `{i['name']}` ({', '.join('`%s`' % c for c in i['columns'])})")
    for f in t["fks"]:
        od = f["onDelete"]
        od_sql = "" if od == "NO ACTION" else f" ON DELETE {od}"
        lines.append(
            f"  CONSTRAINT `{f['name'][:60]}` FOREIGN KEY ({', '.join('`%s`' % c for c in f['columns'])}) "
            f"REFERENCES `{f['refTable']}` ({', '.join('`%s`' % c for c in f['refColumns'])}){od_sql}")
    ddl.append(f"CREATE TABLE IF NOT EXISTS `{n}` (\n" + ",\n".join(lines) +
               "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;")

open(f"{out_dir}/schema.sql", "w").write("\n\n".join(ddl) + "\n")
meta = {"tables": tables, "views": views, "storagePolicies": storage_policies, "tableOrder": order}
json.dump(meta, open(f"{out_dir}/meta.json", "w"), indent=1, ensure_ascii=False)
print(f"tables={len(tables)} views={len(views)} storage_policies={len(storage_policies)}")
