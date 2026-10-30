/* Fusion de deux versions d'un même élément (dossier, bilan, séance, réglage partagé) modifié sur deux appareils.
   base : la version que les deux appareils avaient en commun lors du dernier échange avec le PC ;
   local : celle de cet appareil ; distant : celle qui arrive du PC. null = élément absent ou supprimé.
   Règles : ce qui n'a changé que d'un côté est gardé ; une modification l'emporte sur une suppression
   (aucune séance n'est effacée en silence) ; rendez-vous, corrections et points validés sont réunis élément par élément ;
   si le même champ a changé des deux côtés, la version de cet appareil l'emporte. */

type Objet = Record<string, unknown>;

/* texte stable d'une valeur (clés triées), pour comparer deux versions */
export function stable(v: unknown): string {
  if (v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v as Objet).filter(k => (v as Objet)[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ":" + stable((v as Objet)[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
export const egal = (a: unknown, b: unknown) => stable(a) === stable(b);

const estObjet = (v: unknown): v is Objet => !!v && typeof v === "object" && !Array.isArray(v);

/* listes dont les éléments ont une identité : fusionnées élément par élément */
const IDENTITES: Record<string, (x: unknown) => string> = {
  rdvs: x => String((x as Objet)?.d),                                          // un rendez-vous par jour
  corrections: x => String((x as Objet)?.quand) + "|" + String((x as Objet)?.point),
  valides: x => String(x)
};

function fusionListe(base: unknown, local: unknown, distant: unknown, id: (x: unknown) => string): unknown[] {
  const liste = (v: unknown) => new Map((Array.isArray(v) ? v : []).map(x => [id(x), x] as const));
  const b = liste(base), l = liste(local), r = liste(distant);
  const sortie: unknown[] = [];
  for (const k of new Set([...l.keys(), ...r.keys()])) {
    const v = fusion3(b.get(k) ?? null, l.get(k) ?? null, r.get(k) ?? null);
    if (v !== null) sortie.push(v);
  }
  return sortie;
}

export function fusion3(base: unknown, local: unknown, distant: unknown): unknown {
  if (egal(local, base)) return distant;
  if (egal(distant, base)) return local;
  if (egal(local, distant)) return local;
  if (local === null) return distant;
  if (distant === null) return local;
  if (!estObjet(local) || !estObjet(distant)) return local;
  const b = estObjet(base) ? base : {};
  const sortie: Objet = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(distant)])) {
    const bk = b[k] ?? null, lk = local[k] ?? null, rk = distant[k] ?? null;
    const v = IDENTITES[k] && (Array.isArray(lk) || Array.isArray(rk))
      ? fusionListe(bk, lk, rk, IDENTITES[k]).sort((x, y) => k === "rdvs" ? String((x as Objet).d).localeCompare(String((y as Objet).d)) : 0)
      : egal(lk, bk) ? rk : egal(rk, bk) ? lk : lk;
    if (v !== null && v !== undefined) sortie[k] = v;
  }
  return sortie;
}
