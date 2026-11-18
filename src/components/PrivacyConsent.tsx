import { Link } from "react-router-dom";

interface PrivacyConsentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}

export function PrivacyConsent({ checked, onChange, id = "privacy-consent", className = "" }: PrivacyConsentProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2 text-xs text-[hsl(var(--muted-foreground))] cursor-pointer ${className}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[hsl(var(--primary))]"
        required
      />
      <span>
        Ich habe die{" "}
        <Link
          to="/datenschutz"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[hsl(var(--primary))] hover:underline"
        >
          Datenschutzerklärung
        </Link>{" "}
        gelesen und stimme ihr zu.
      </span>
    </label>
  );
}
