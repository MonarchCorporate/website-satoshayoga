export interface CourseTypeContent {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  description: string[];
  suitedFor: string[];
  note?: string;
  accent: string; // HSL value or token reference
}

export const courseTypesContent: CourseTypeContent[] = [
  {
    id: "vinyasa",
    emoji: "🔥",
    title: "Vinyasa Yoga",
    subtitle: "Dynamisch & Fließend",
    description: [
      "Vinyasa Yoga ist eine kraftvolle und fließende Praxis, bei der Atem und Bewegung miteinander verschmelzen.",
      "Dynamische Sequenzen verbinden verschiedene Asanas (Positionen) zu einem harmonischen Flow. Dadurch werden nicht nur Kraft, Beweglichkeit und Ausdauer gestärkt, sondern auch Fokus und mentale Klarheit gefördert.",
      "Die Stunde ist etwas zügiger aufgebaut und bietet dir Raum, deine Praxis weiterzuentwickeln und dich körperlich herauszufordern.",
    ],
    suitedFor: [
      "dich gerne dynamisch bewegst",
      "bereits erste Yogaerfahrung/Bewegungserfahrung mitbringst",
      "deine Kraft, Ausdauer und Koordination verbessern möchtest",
    ],
    accent: "14 80% 62%",
  },
  {
    id: "sculpt",
    emoji: "💪",
    title: "Sculpt Yoga",
    subtitle: "Kraftvoll & Energetisch",
    description: [
      "Sculpt Yoga kombiniert klassische Yoga-Elemente mit funktionellem Krafttraining.",
      "Dich erwartet ein Yoga-Flow in Verbindung mit gezielten Kräftigungsübungen und leichten Gewichten (1–3 kg), um deine Muskulatur effektiv zu stärken und den ganzen Körper zu formen.",
      "Statische Haltepositionen wechseln sich mit kraftvollen Bewegungsabläufen ab. Gelegentlich sorgt eine kurze HIIT-Sequenz für zusätzliche Intensität und bringt deinen Kreislauf in Schwung.",
      "Eine erholsame Schlussentspannung rundet die Stunde ab und bringt dich wieder in Balance.",
    ],
    suitedFor: [
      "Krafttraining und Yoga verbinden willst",
      "ins Schwitzen kommen möchtest",
      "bereits etwas Bewegungserfahrung mitbringst",
    ],
    accent: "32 90% 58%",
  },
  {
    id: "relax-yoga",
    emoji: "😌",
    title: "Relax Yoga",
    subtitle: "Sanft & entspannt",
    description: [
      "Relax Yoga ist eine ruhige Yogaeinheit ohne fließenden Flow. Sanfte Dehnungen, Mobilisation und bewusste Bewegungen helfen dir dabei, Verspannungen zu lösen und deinen Körper wieder ins Gleichgewicht zu bringen.",
      "Mit Hilfsmitteln wie Bällen, Bolster und Co. kannst du einzelne Bereiche gezielt lockern und entspannen. Dabei bleibt viel Zeit zum Nachspüren, bewussten Atmen und Loslassen.",
    ],
    suitedFor: [
      "deinen Körper sanft mobilisieren möchtest",
      "Verspannungen lösen möchtest",
      "eine ruhige Auszeit vom Alltag suchst",
    ],
    accent: "195 45% 60%",
  },
  {
    id: "maenner-yoga",
    emoji: "🧑‍🤝‍🧑",
    title: "Männer Yoga",
    subtitle: "Kraft & Beweglichkeit",
    description: [
      "Männer Yoga ist der ideale Einstieg für alle, die Yoga in einer entspannten und offenen Runde kennenlernen oder vertiefen möchten.",
      "Der Fokus liegt auf klaren, effektiven Übungen, die dich fordern und gleichzeitig gut zugänglich sind – egal, ob du neu einsteigst oder bereits Erfahrung mitbringst.",
      "Fließende Bewegungen, gezielte Dehnung und bewusste Atmung helfen dir, einen Ausgleich zum Alltag zu schaffen und deinen Körper ganzheitlich zu stärken.",
    ],
    suitedFor: [
      "deine Beweglichkeit verbessern möchtest",
      "Kraft und Stabilität aufbauen willst",
      "einen sportlichen Ausgleich suchst",
      "Yoga in einer kleinen Runde unter Männern erleben möchtest",
    ],
    accent: "210 60% 60%",
  },
  {
    id: "slow-vinyasa",
    emoji: "🧘‍♀️",
    title: "Slow Vinyasa",
    subtitle: "Sanft & Achtsam",
    description: [
      "Slow Vinyasa ist eine ruhige, fließende Yoga-Praxis, die sich besonders für Anfänger und alle eignet, die bewusst langsamer üben möchten.",
      "Die Bewegungen werden achtsam und in einem reduzierten Tempo ausgeführt, sodass du genügend Zeit hast, die Haltungen sauber einzunehmen und deinen Atem mit der Bewegung zu verbinden.",
      "Im Fokus stehen sanfte, fließende Sequenzen, die deine Beweglichkeit fördern, Kraft aufbauen und gleichzeitig für Entspannung sorgen.",
    ],
    suitedFor: [
      "Yoga entspannt kennenlernen möchtest",
      "dir mehr Ruhe und Achtsamkeit wünschst",
      "eine sanfte, ausgleichende Praxis suchst",
    ],
    accent: "165 50% 55%",
  },
  {
    id: "morning-flow",
    emoji: "☀️",
    title: "Morning Flow",
    subtitle: "Aktiv & Ausgleichend",
    description: [
      "Morning Flow ist eine ausgewogene Mischung aus ruhigen und dynamischen Elementen – ideal, um energiegeladen in den Tag zu starten.",
      "Fließende Bewegungen mobilisieren deinen Körper, während gezielte Übungen Kraft aufbauen und deine Stabilität fördern. Gleichzeitig hilft dir die bewusste Verbindung von Atem und Bewegung, klar und fokussiert in den Tag zu gehen.",
      "Die Stunde wirkt aktivierend und schafft die perfekte Balance aus Bewegung, Kräftigung und Leichtigkeit.",
    ],
    suitedFor: [
      "deinen Tag aktiv und bewusst beginnen möchtest",
      "Mobilität und Kraft gleichzeitig aufbauen willst",
      "eine ausgewogene Mischung aus ruhigem und dynamischem Yoga suchst",
      "bereits Bewegungserfahrung mitbringst",
    ],
    accent: "45 90% 60%",
  },
  {
    id: "yin",
    emoji: "🌙",
    title: "Yin Yoga & Yin Flow",
    subtitle: "Ruhe & Tiefe",
    description: [
      "Yin Yoga ist eine ruhige, passive Praxis, bei der die Asanas über mehrere Minuten (ca. 3–5 Minuten) gehalten werden.",
      "Durch das lange Verweilen in den Asanas werden Faszien und Muskulatur sanft gedehnt, während du gleichzeitig zur Ruhe kommst und ein tieferes Körpergefühl entwickelst. Der Fokus liegt auf Loslassen, Entschleunigung und bewusster Atmung.",
      "Im Yin Flow wird diese ruhige Praxis durch sanfte, mobilisierende Bewegungen ergänzt. So entsteht eine ausgewogene Kombination aus Tiefe, Entspannung und leichter Bewegung.",
    ],
    suitedFor: [
      "Yogaanfänger bist",
      "dir tiefe Entspannung wünschst & langfristig mehr Beweglichkeit",
      "sowohl in die Tiefe gehen als auch sanft in Bewegung bleiben möchtest",
    ],
    accent: "260 50% 65%",
  },
  {
    id: "medical",
    emoji: "🌿",
    title: "Medical Yoga",
    subtitle: "Individuell & gezielt (1:1)",
    description: [
      "Medical Yoga verbindet traditionelle Yoga-Techniken mit fundiertem medizinischem Wissen, um gezielt auf körperliche Beschwerden und individuelle Bedürfnisse einzugehen.",
      "Im 1:1-Format stehst ganz du im Mittelpunkt: Jede Stunde wird passend für dich und deine aktuellen Themen aufgebaut – ob zur Linderung von Beschwerden, zum Aufbau von Stabilität oder zur Verbesserung deiner Beweglichkeit.",
      "Durch eine Kombination aus achtsamer Bewegung, gezielten Übungen und bewusster Atmung arbeiten wir daran, deinen Körper nachhaltig zu stärken und ins Gleichgewicht zu bringen.",
      "Medical Yoga versteht sich als ergänzende Maßnahme und ersetzt keine ärztliche Behandlung.",
    ],
    suitedFor: [
      "gezielt an Beschwerden arbeiten möchtest",
      "nicht im Gruppenformat üben möchtest",
      "dir eine individuell angepasste Praxis wünschst",
      "deinen Körper besser verstehen und unterstützen möchtest",
    ],
    note: "Das 1:1 Medical Yoga Angebot richtet sich ausschließlich an Frauen.",
    accent: "180 50% 55%",
  },
];
