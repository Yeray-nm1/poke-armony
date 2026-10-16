// Compatibilidad por parejas: qué piezas del equipo se ayudan y cuáles se
// estorban, con el mecanismo concreto. Es el detalle *explicable* que la antigua
// métrica de «Sinergia» colapsaba en un número; no puntúa la armonía.
//
// Todo sale de datos (movimientos, habilidad, objeto, tipos) reutilizando las
// tablas del motor (`harmony.ts`), sin listas curadas nuevas.
import { effVs, TYPES } from "./typechart"
import {
  FIELD_ABUSER_MOVES, GUARD_MOVES, OFFENSE_SUPPORT_MOVES, REDIRECT_MOVES, SCREEN_MOVES, SETUP_MOVES,
  speedProfile, speciesOf, TERRAINS, toId, WEATHERS, type FieldKind,
} from "./harmony"
import type { Meta, MoveData, MoveDex, Pokedex, Team, TeamSet } from "./types"

/** Una interacción notable entre dos piezas (`a === b` ⇒ consigo misma). */
export interface PairNote {
  /** Índice (ranura) de la pieza que **aporta** la sinergia o **causa** el roce. */
  a: number
  /** Índice de la pieza que la **recibe**; igual a `a` cuando es un auto-beneficio. */
  b: number
  /** Categoría corta, p. ej. "clima · sol", "fuego amigo", "cobertura". */
  tag: string
  /** Explicación con el mecanismo concreto. */
  detail: string
}

export interface CompatibilityReport {
  synergies: PairNote[]
  conflicts: PairNote[]
}

// Habilidades que anulan por completo el daño de un spread aliado (inmunidad).
const SPREAD_ABSORB: Record<string, string[]> = {
  Ground: ["Levitate"],
  Electric: ["Volt Absorb", "Motor Drive", "Lightning Rod"],
  Fire: ["Flash Fire"],
  Water: ["Water Absorb", "Dry Skin"],
  Grass: ["Sap Sipper"],
}

// Habilidad de redirección → tipo de ataque que atrae al usuario. Así cubre al
// compañero que es débil a ese tipo.
const REDIRECT_TYPE: Record<string, string> = { "Storm Drain": "Water", "Lightning Rod": "Electric" }

// Tipo que potencia cada campo (para el «STAB + clima/terreno»). Arena y nieve
// no potencian ningún tipo.
const FIELD_BOOST: Record<string, string> = {
  sun: "Fire", rain: "Water", grassy: "Grass", electric: "Electric", psychic: "Psychic", misty: "Fairy",
}

// Efecto de las habilidades que se activan con un campo, para la explicación.
const ABILITY_FIELD_NOTE: Record<string, string> = {
  Chlorophyll: "duplica su Velocidad con el sol",
  "Solar Power": "potencia su At. Esp. con el sol (a cambio de PS)",
  "Leaf Guard": "evita los problemas de estado con el sol",
  Harvest: "recupera sus bayas con el sol",
  "Flower Gift": "sube el Ataque de sus aliados con el sol",
  "Swift Swim": "duplica su Velocidad con la lluvia",
  Hydration: "cura sus problemas de estado con la lluvia",
  "Rain Dish": "recupera PS cada turno con la lluvia",
  "Dry Skin": "recupera PS con la lluvia",
  "Sand Rush": "duplica su Velocidad en la arena",
  "Sand Force": "potencia sus movimientos de Roca/Tierra/Acero en la arena",
  "Sand Veil": "sube su Evasión en la arena",
  "Slush Rush": "duplica su Velocidad en la nieve",
  "Ice Body": "recupera PS cada turno en la nieve",
  "Grassy Pelt": "sube su Defensa en el terreno hierba",
  "Surge Surfer": "duplica su Velocidad en el terreno eléctrico",
}

const hasMove = (set: TeamSet, list: string[]) => (set.attacks ?? []).some((m) => list.includes(m))

const damagingMoves = (set: TeamSet, moves: MoveDex): MoveData[] =>
  (set.attacks ?? [])
    .map((m) => moves[toId(m)])
    .filter((m): m is MoveData => !!m && m.category !== "Status" && m.basePower > 0)

/** Movimientos «spread» que alcanzan al aliado (todo el campo salvo el usuario). */
const isSpread = (m?: MoveData) =>
  !!m && m.category !== "Status" && m.basePower > 0 && m.target === "allAdjacent"

const multLabel = (eff: number) => `×${String(eff).replace(".", ",")}`

/** Qué puede hacer el aliado para esquivar el fuego amigo (además de inmunidades). */
function fireMitigation(ally: TeamSet): string {
  if ((ally.attacks ?? []).some((m) => m === "Wide Guard")) return "su Wide Guard lo bloquea"
  if ((ally.attacks ?? []).some((m) => m === "Protect" || m === "Detect")) return "puede evitarlo un turno con Protect"
  return "no lleva con qué evitarlo"
}

const listTypes = (types: string[]) => types.join(", ")

/**
 * Empareja los miembros del equipo y explica cómo se llevan: campos compartidos
 * (clima/terreno → beneficiario), seteo habilitado, control de velocidad,
 * redirección, empujón ofensivo y cobertura de tipos; y los roces: fuego amigo
 * de los spreads, campos contradictorios y Trick Room contra Tailwind.
 */
export function teamCompatibility(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta): CompatibilityReport {
  const synergies: PairNote[] = []
  const conflicts: PairNote[] = []
  const n = team.length
  const name = (i: number) => speciesOf(dex, team[i].id)?.name ?? team[i].name ?? team[i].id
  const typesOf = (i: number) => speciesOf(dex, team[i].id)?.types ?? []

  // ── Campos compartidos: el setter y quien lo aprovecha ──────────────
  const fields: { kind: FieldKind; noun: string }[] = [
    ...WEATHERS.map((k) => ({ kind: k, noun: "clima" })),
    ...TERRAINS.map((k) => ({ kind: k, noun: "terreno" })),
  ]
  for (const { kind, noun } of fields) {
    const setters: number[] = []
    for (let i = 0; i < n; i++) {
      if (kind.setAbilities.includes(team[i].ability ?? "") || hasMove(team[i], kind.setMoves)) setters.push(i)
    }
    if (!setters.length) continue
    const boost = FIELD_BOOST[kind.key]
    for (const s of setters) {
      for (let b = 0; b < n; b++) {
        const set = team[b]
        const reasons: string[] = []
        if (set.ability && (kind.abuserAbilities ?? []).includes(set.ability)) {
          const note = ABILITY_FIELD_NOTE[set.ability]
          reasons.push(note ? `su ${set.ability} ${note}` : `su habilidad ${set.ability} se activa`)
        }
        const boostMoves = [...(kind.abuserMoves ?? []), ...FIELD_ABUSER_MOVES]
        const mv = (set.attacks ?? []).find((m) => boostMoves.includes(m))
        if (mv) reasons.push(`su ${mv} se refuerza`)
        if (set.item && (kind.abuserItems ?? []).includes(set.item)) reasons.push(`su ${set.item} se aprovecha`)
        if (boost) {
          const stab = damagingMoves(set, moves).find((m) => m.type === boost && typesOf(b).includes(boost))
          if (stab) reasons.push(`su ${stab.name ?? stab.type} recibe STAB + ${kind.label}`)
        }
        if (!reasons.length) continue
        const who = b === s ? "lo aprovecha él mismo" : "se beneficia"
        synergies.push({
          a: s, b,
          tag: `${noun} · ${kind.label}`,
          detail: `${name(s)} pone ${kind.label} y ${name(b)} ${who}: ${reasons.join(" y ")}.`,
        })
      }
    }
  }

  // ── Seteo habilitado: apoyo → quien carga el seteo ──────────────────
  const setupUsers = team.map((s, i) => (hasMove(s, SETUP_MOVES) ? i : -1)).filter((i) => i >= 0)
  if (setupUsers.length) {
    for (let a = 0; a < n; a++) {
      const set = team[a]
      const mech: string[] = []
      if (hasMove(set, ["Fake Out"])) mech.push("amaga con Fake Out")
      if (hasMove(set, REDIRECT_MOVES)) mech.push("redirige los ataques (Follow Me / Rage Powder)")
      if (hasMove(set, SCREEN_MOVES)) mech.push("levanta pantallas")
      if (hasMove(set, GUARD_MOVES)) mech.push("cubre con Wide/Quick Guard")
      if (!mech.length) continue
      for (const b of setupUsers) {
        if (b === a) continue
        const setupMove = (team[b].attacks ?? []).find((m) => SETUP_MOVES.includes(m))
        synergies.push({
          a, b, tag: "seteo",
          detail: `${name(a)} ${mech.join(" y ")} para que ${name(b)} cargue ${setupMove}.`,
        })
      }
    }
  }

  // ── Control de velocidad: Trick Room para los lentos ────────────────
  const trUsers = team.map((s, i) => (hasMove(s, ["Trick Room"]) ? i : -1)).filter((i) => i >= 0)
  if (trUsers.length) {
    const sp = speedProfile(team, dex, meta)
    const threatSpeeds = sp.threats.map((t) => t.speed).sort((a, b) => a - b)
    const median = threatSpeeds.length ? threatSpeeds[Math.floor(threatSpeeds.length / 2)] : 0
    for (const a of trUsers) {
      for (let b = 0; b < n; b++) {
        if (b === a) continue
        if (sp.teamSpeeds[b] > 0 && sp.teamSpeeds[b] < median) {
          synergies.push({
            a, b, tag: "Trick Room",
            detail: `${name(a)} pone Trick Room; ${name(b)} es más lento que la media del meta y así actúa antes.`,
          })
        }
      }
    }
  }

  // ── Redirección: cubre al compañero débil al tipo que atrae ─────────
  for (let a = 0; a < n; a++) {
    const rt = REDIRECT_TYPE[team[a].ability ?? ""]
    if (!rt) continue
    for (let b = 0; b < n; b++) {
      if (b === a) continue
      if (effVs(rt, typesOf(b)) > 1) {
        synergies.push({
          a, b, tag: "redirección",
          detail: `${name(a)} atrae los ataques ${rt} con ${team[a].ability}; ${name(b)} es débil a ${rt} y queda cubierto.`,
        })
      }
    }
  }

  // ── Cobertura ofensiva: X pega fuerte a lo que amenaza a Y ──────────
  // Para cada debilidad de Y se busca al miembro que mejor la castiga (con un
  // movimiento súper eficaz; se prefiere STAB y más potencia). `a` es quien
  // golpea (X) y `b` el amenazado (Y).
  const offenseScore = (set: TeamSet, ownTypes: string[], t: string): number => {
    let best = 0
    for (const m of damagingMoves(set, moves)) {
      if (effVs(m.type, [t]) < 2) continue
      const score = m.basePower * (ownTypes.includes(m.type) ? 1.5 : 1)
      if (score > best) best = score
    }
    return best
  }
  for (let y = 0; y < n; y++) {
    const threats = TYPES.filter((t) => effVs(t, typesOf(y)) > 1)
    const byCoverer = new Map<number, string[]>()
    for (const t of threats) {
      let best = -1
      let bestScore = 0
      for (let x = 0; x < n; x++) {
        if (x === y) continue
        const score = offenseScore(team[x], typesOf(x), t)
        if (score > bestScore) {
          best = x
          bestScore = score
        }
      }
      if (best >= 0) byCoverer.set(best, [...(byCoverer.get(best) ?? []), t])
    }
    for (const [x, ts] of byCoverer) {
      synergies.push({
        a: x, b: y, tag: "cobertura",
        detail: `${name(x)} pega fuerte a ${listTypes(ts)}, tipos que amenazan a ${name(y)}.`,
      })
    }
  }

  // ── Empujón ofensivo: apoyo que potencia a un atacante ──────────────
  for (let a = 0; a < n; a++) {
    const support = (team[a].attacks ?? []).find((m) => OFFENSE_SUPPORT_MOVES.includes(m))
    if (!support) continue
    for (let b = 0; b < n; b++) {
      if (b === a || !damagingMoves(team[b], moves).length) continue
      synergies.push({
        a, b, tag: "apoyo ofensivo",
        detail: `${name(a)} potencia los ataques de ${name(b)} con ${support}.`,
      })
    }
  }

  // ── Fuego amigo: el spread que alcanza al aliado ────────────────────
  for (let h = 0; h < n; h++) {
    const spreads = (team[h].attacks ?? []).map((m) => moves[toId(m)]).filter(isSpread)
    if (!spreads.length) continue
    for (let a = 0; a < n; a++) {
      if (a === h) continue
      let worst: MoveData | null = null
      let worstEff = 0
      for (const sp of spreads) {
        const eff = effVs(sp.type, typesOf(a))
        if ((SPREAD_ABSORB[sp.type] ?? []).includes(team[a].ability ?? "")) continue
        if (sp.type === "Ground" && team[a].item === "Air Balloon") continue
        if (eff <= 0) continue
        if (eff > worstEff) { worst = sp; worstEff = eff }
      }
      if (!worst) continue
      const tone = worstEff >= 2 ? "súper efectivo" : worstEff === 1 ? "daño neutro" : "daño reducido"
      conflicts.push({
        a: h, b: a, tag: "fuego amigo",
        detail: `${name(h)} lleva ${worst.name}: alcanza a ${name(a)} con ${tone} (${multLabel(worstEff)}); ${fireMitigation(team[a])}.`,
      })
    }
  }

  // ── Campos contradictorios: dos climas o dos terrenos distintos ─────
  const fieldConflicts = (kinds: FieldKind[], noun: string) => {
    const setters: { i: number; kind: FieldKind }[] = []
    for (let i = 0; i < n; i++) {
      for (const k of kinds) {
        if (k.setAbilities.includes(team[i].ability ?? "") || hasMove(team[i], k.setMoves)) setters.push({ i, kind: k })
      }
    }
    for (let x = 0; x < setters.length; x++) {
      for (let y = x + 1; y < setters.length; y++) {
        const A = setters[x], B = setters[y]
        if (A.kind.key === B.kind.key) continue
        conflicts.push({
          a: A.i, b: B.i, tag: noun,
          detail: `${name(A.i)} pone ${A.kind.label} y ${name(B.i)} pone ${B.kind.label}: el segundo anula al primero.`,
        })
      }
    }
  }
  fieldConflicts(WEATHERS, "clima")
  fieldConflicts(TERRAINS, "terreno")

  // ── Trick Room contra Tailwind: direcciones opuestas ────────────────
  const twUsers = team.map((s, i) => (hasMove(s, ["Tailwind"]) ? i : -1)).filter((i) => i >= 0)
  for (const a of trUsers) {
    for (const b of twUsers) {
      if (a === b) continue
      conflicts.push({
        a, b, tag: "velocidad",
        detail: `${name(a)} quiere frenar la carrera (Trick Room) y ${name(b)} acelerarla (Tailwind): van en direcciones opuestas.`,
      })
    }
  }

  return { synergies, conflicts }
}
