// Muninn sur le PC : travail en tâche de fond. VERSION = 1
// Fichier construit par « npm run pc » depuis src/pc/travail.ts : ne pas le modifier à la main.
//#region src/regles.ts
function avenirFrom(txt) {
	const t = String(txt || "");
	for (const re of [
		/(?:^|\n)[ \t]*[àa]\s+venir\s*:/i,
		/pour\s+la\s+(?:prochaine|s[ée]ance\s+suivante)(?:\s+(?:s[ée]ance|fois))?/i,
		/(?:la\s+)?prochaine\s+(?:s[ée]ance|fois)|s[ée]ance\s+suivante/i,
		/[.!?]\s*[àa]\s+venir\s*:/i
	]) {
		const m = re.exec(t);
		if (m) {
			const out = t.slice(m.index + m[0].length).replace(/^[\s:,;.\-–—]+/, "").trim();
			if (out) return out.charAt(0).toUpperCase() + out.slice(1);
		}
	}
	return "";
}
function empreinteTexte(t) {
	let h = 2166136261;
	for (let i = 0; i < t.length; i++) {
		h ^= t.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	let h2 = 2538058380;
	for (let i = t.length - 1; i >= 0; i--) {
		h2 ^= t.charCodeAt(i);
		h2 = Math.imul(h2, 1540483477) >>> 0;
	}
	return "#" + t.length.toString(36) + "." + h.toString(36) + h2.toString(36);
}
const isoDay = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const demiDe = (r) => r.p ?? (r.h ? r.h < "13:00" ? "am" : "pm" : null);
const DEMI_FR = {
	am: "matin",
	pm: "après-midi"
};
const rdvKey = (r) => {
	const m = demiDe(r);
	return r.d + " " + (m === "am" ? "1" : m === "pm" ? "2" : "3") + " " + (r.h || "99:99");
};
const copieRdv = (r) => ({
	d: r.d,
	h: r.h || "",
	...r.t === "bilan" ? { t: "bilan" } : {},
	...demiDe(r) ? { p: demiDe(r) } : {}
});
const avecRdv = (list, d, h, t, p) => list.filter((r) => r.d !== d).concat([copieRdv({
	d,
	h: h || "",
	...t === "bilan" ? { t: "bilan" } : {},
	...p ? { p } : {}
})]).sort((a, b) => rdvKey(a) < rdvKey(b) ? -1 : 1);
function poserRdvs(list, dictes, demiDefaut) {
	let l = list;
	for (const x of dictes) {
		const deja = l.find((r) => r.d === x.d);
		if (deja && !x.demi) continue;
		l = avecRdv(l, x.d, x.h || (deja?.h ?? ""), deja?.t, x.demi || demiDefaut);
	}
	return l;
}
function demiSeance(rdvs, date) {
	const r = rdvs.find((x) => x.d === date);
	return r ? demiDe(r) : null;
}
const estArchive = (d) => !!d.fin && !d.rdvs.some((r) => r && r.d > d.fin);
const sansAccents = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const mots = (t) => sansAccents(t).replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
function nomCorrespond(dicte, label) {
	const d = mots(dicte), l = mots(label);
	if (!d.length || !l.length) return false;
	if (d.join("") === l.join("")) return true;
	const espace = label.trim().indexOf(" ");
	if (espace < 0) {
		const c = l.join(""), p = d.join("");
		return d.length === 1 && c.startsWith(p) && c.length - p.length <= 3;
	}
	const prenom = mots(label.slice(0, espace)), reste = mots(label.slice(espace)).join("");
	if (d.length < prenom.length || prenom.some((m, i) => d[i] !== m)) return false;
	const dit = d.slice(prenom.length).join("");
	return !dit || dit.startsWith(reste) || reste.startsWith(dit);
}
function rattacher(dicte, dossiers, date) {
	const vuCeJour = (d) => d.rdvs.some((r) => r.d === date);
	const heure = (d) => d.rdvs.find((r) => r.d === date)?.h || "99:99";
	const ordre = (a, b) => heure(a).localeCompare(heure(b)) || a.label.localeCompare(b.label, "fr");
	const actifs = dossiers.filter((d) => !estArchive(d));
	const possibles = dicte ? actifs.filter((d) => nomCorrespond(dicte, d.label)).sort(ordre) : [];
	const duJour = possibles.filter(vuCeJour);
	if (duJour.length === 1) return {
		dossier: duJour[0],
		candidats: duJour
	};
	if (!duJour.length && possibles.length === 1) return {
		dossier: possibles[0],
		candidats: possibles
	};
	const archives = dicte && !possibles.length ? dossiers.filter((d) => estArchive(d) && nomCorrespond(dicte, d.label)).sort(ordre) : [];
	return {
		dossier: null,
		candidats: duJour.length > 1 ? duJour : possibles.length ? possibles : archives.length ? archives : [...actifs].sort(ordre)
	};
}
const PAS = 20;
const dureeRdv = (r) => r.t === "bilan" ? 40 : 20;
const minutes = (h) => {
	const [a, b] = h.split(":").map(Number);
	return a * 60 + (b || 0);
};
function rdvsDuJour(dossiers, iso) {
	return dossiers.flatMap((d) => d.rdvs.filter((r) => r.d === iso).map((r) => {
		const debut = r.h ? minutes(r.h) : null;
		return {
			dossier: d,
			rdv: r,
			debut,
			fin: debut == null ? null : debut + dureeRdv(r)
		};
	})).sort((a, b) => rdvKey(a.rdv).localeCompare(rdvKey(b.rdv)) || a.dossier.label.localeCompare(b.dossier.label, "fr"));
}
const FANTOMES = [
	/sous-titr(?:es|age|é)[^.!?\n]*(?:amara(?:\.org)?|st' ?501|radio-canada|soustitreur|communaut[ée](?: d'amara(?:\.org)?)?)[^.!?\n]*[.!?]?/gi,
	/merci d'avoir regardé(?: cette vidéo)?\s*[.!?]?/gi,
	/(?:n'oubliez pas de |pensez à )?(?:vous )?abonne[zr][- ]vous[^.!?\n]*[.!?]?/gi,
	/n'oubliez pas de liker[^.!?\n]*[.!?]?/gi
];
function nettoyerVoix(t) {
	let r = String(t || "");
	for (const f of FANTOMES) r = r.replace(f, " ");
	return r.replace(/\s+/g, " ").trim();
}
function suiteDe(avant) {
	const t = avant.trim();
	if (t.length <= 200) return t;
	const fin = t.slice(t.length - 200);
	const espace = fin.indexOf(" ");
	return (espace >= 0 ? fin.slice(espace + 1) : fin).trim();
}
function indiceVoix(noms, avant = "") {
	const n = [...new Set(noms.map((x) => x.trim()).filter(Boolean))].slice(0, 40);
	const a = suiteDe(avant);
	return n.length || a ? {
		noms: n,
		avant: a
	} : null;
}
const jourLong = (iso) => {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d, 12).toLocaleDateString("fr-FR", {
		weekday: "long",
		day: "numeric",
		month: "long"
	});
};

//#endregion
//#region src/ia.ts
const MODELES = {
	puissant: {
		api: "claude-opus-5-5",
		abonnement: "opus",
		prix: {
			entree: 4,
			sortie: 20
		}
	},
	leger: {
		api: "claude-sonnet-5-5",
		abonnement: "sonnet",
		prix: {
			entree: 2,
			sortie: 10
		}
	}
};
const MODELE = MODELES.puissant.api;
const PRIX = MODELES.puissant.prix;
var ErreurIA = class extends Error {
	nature;
	constructor(message, nature = "definitif") {
		super(message);
		this.nature = nature;
	}
};
const natureDe = (e) => e instanceof ErreurIA ? e.nature : "passager";
const horsLigne = () => typeof navigator !== "undefined" && navigator.onLine === false;
const DELAI_SERVEUR_MS = 93e4;
const appelAbonnementVers = (adresse = "") => async ({ cle, system, contenu, schema, effort, niveau }) => {
	let r;
	try {
		r = await fetch(adresse.replace(/\/+$/, "") + "/api/ia/travail", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer " + cle
			},
			body: JSON.stringify({
				system,
				contenu,
				schema,
				effort,
				modele: MODELES[niveau].abonnement
			}),
			signal: AbortSignal.timeout(DELAI_SERVEUR_MS)
		});
	} catch (e) {
		if (e?.name === "TimeoutError") throw new ErreurIA("Le serveur de l'appli n'a pas répondu à temps.", "passager");
		if (horsLigne()) throw new ErreurIA("Pas de connexion à internet.", "reseau");
		throw new ErreurIA("Le serveur de l'appli est injoignable.", "passager");
	}
	let corps = {};
	try {
		corps = await r.json();
	} catch {}
	if (!r.ok || corps.erreur) {
		const nature = corps.nature ?? (r.status === 401 || r.status === 503 ? "definitif" : "passager");
		throw new ErreurIA(corps.erreur || `Le serveur a répondu par une erreur (${r.status}).`, nature);
	}
	return {
		donnees: corps.donnees,
		usage: {
			entree: 0,
			sortie: 0,
			coutIndicatif: corps.coutIndicatif ?? void 0
		}
	};
};
const appelerAbonnement = appelAbonnementVers();
const texteOuNul = { anyOf: [{ type: "string" }, { type: "null" }] };
const MAX_DICTEE = 6e4;
const MAX_SEANCE = 2e4;
const milliers = (n) => n.toLocaleString("fr-FR");
function verifierLongueur(texte, max, quoi) {
	const n = texte.trim().length;
	if (n <= max) return;
	throw new ErreurIA(quoi === "dictee" ? `Cette dictée est trop longue pour être rangée d'un coup (${milliers(n)} caractères, ${milliers(max)} au plus, environ une heure de parole). Coupez-la en deux : rangez la première moitié, puis la seconde. Rien n'a été rangé, votre dictée est gardée.` : `Cette note est trop longue pour être mise au propre (${milliers(n)} caractères, ${milliers(max)} au plus). Elle est enregistrée telle quelle.`);
}
function calendrier(depuis, avant, apres) {
	const [y, m, d] = depuis.split("-").map(Number), out = [];
	for (let i = -avant; i <= apres; i++) {
		const x = new Date(y, m - 1, d + i, 12);
		out.push((i === 0 ? "J" : i > 0 ? "J+" + i : "J" + i) + " : " + x.toLocaleDateString("fr-FR", {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric"
		}) + " = " + isoDay(x));
	}
	return out.join("\n");
}
const RDV_AUTRES = {
	type: "array",
	items: {
		type: "object",
		additionalProperties: false,
		required: ["date", "demi"],
		properties: {
			date: { type: "string" },
			demi: { type: ["string", "null"] }
		}
	}
};
const RDV_ANNULES = {
	type: "array",
	items: { type: "string" }
};
const OBJECTIFS = {
	type: "array",
	items: { type: "string" }
};
const SCHEMA_SEANCE = {
	type: "object",
	additionalProperties: false,
	required: [
		"propre",
		"resume",
		"bref",
		"rdv_date",
		"rdv_heure",
		"rdv_demi",
		"rdv_autres",
		"rdv_annules",
		"objectifs",
		"fin_traitement"
	],
	properties: {
		propre: texteOuNul,
		resume: texteOuNul,
		bref: texteOuNul,
		rdv_date: texteOuNul,
		rdv_heure: texteOuNul,
		rdv_demi: texteOuNul,
		rdv_autres: RDV_AUTRES,
		rdv_annules: RDV_ANNULES,
		objectifs: OBJECTIFS,
		fin_traitement: { type: "boolean" }
	}
};
function promptSeance(date, contenu, sansPropre) {
	const brut = avenirFrom(contenu);
	return "Tu aides un kinésithérapeute. Voici sa note, souvent dictée à voix haute, pour la séance du " + date + " (J) avec un patient. Une dictée peut contenir des mots mal reconnus, peu de ponctuation, des hésitations et des répétitions.\n\nCalendrier de repère, à utiliser pour toute date (ne calcule rien toi-même) :\n" + calendrier(date, 0, 70) + "\n\nRéponds uniquement par un objet JSON avec les champs suivants :\n- \"propre\" : " + (sansPropre ? "null" : "la note remise au propre. Corrige l'orthographe, la ponctuation et les mots manifestement mal reconnus par la dictée (termes d'anatomie et de kinésithérapie compris), retire hésitations et répétitions. Range chaque information sous la rubrique qui convient, dans cet ordre, une rubrique par ligne au format « Rubrique : texte », sans les rubriques vides : « État du patient » (ce que le patient rapporte, douleur, évolution depuis la dernière fois), « Fait en séance », « À faire à la maison », « Autres notes » (ce qui ne va nulle part ailleurs), « À venir » (ce qui est prévu pour la suite, y compris le moment de la prochaine séance s'il est dit, avec ses mots à lui). Règles strictes : n'ajoute aucune information, n'interprète pas, ne conclus pas, ne retire aucune information, garde les chiffres et le vocabulaire du kinésithérapeute, phrases courtes. Si un mot reste incompréhensible, garde-le tel quel suivi de « (?) ». Si un nom de famille complet apparaît, réduis-le à son initiale suivie d'un point.") + "\n- \"resume\" : " + (brut ? "résumé très court (25 mots maximum, français correct, style télégraphique) de ce qui est prévu pour la prochaine séance, d'après le passage « Prévu » ci-dessous. N'ajoute rien, n'interprète pas, ne retire rien d'important. N'y mets ni la date ni l'heure du rendez-vous. null s'il n'y a rien d'autre que la date." : "null") + "\n- \"bref\" : résumé très court (20 mots maximum, style télégraphique) de la séance : état du patient et ce qui a été fait, avec ses chiffres (douleur, amplitudes). Pas ce qui est prévu pour la suite. N'ajoute rien, n'interprète pas. null si la note est vide.\n- \"rdv_date\" : si la note dit quand aura lieu la prochaine séance (par exemple « dans une semaine », « lundi prochain », « le 12 »), la date correspondante lue dans le calendrier, au format AAAA-MM-JJ, comptée à partir de J. " + REGLE_JOUR + " null si ce n'est pas dit ou si c'est ambigu. Ne devine pas.\n- \"rdv_heure\" : l'heure annoncée de cette prochaine séance au format HH:MM, sinon null.\n- \"rdv_demi\" : " + CONSIGNE_DEMI + "\n- \"rdv_autres\" : les AUTRES séances à venir annoncées en plus de rdv_date (« lundi, mardi et jeudi prochain » : rdv_date = la première, rdv_autres = les suivantes), chacune {\"date\": AAAA-MM-JJ lue dans le calendrier, \"demi\": « matin », « après-midi » ou null si ce n'est pas dit pour ce jour-là}. [] s'il n'y en a pas. Ne devine pas.\n- \"rdv_annules\" : les dates (AAAA-MM-JJ, lues dans le calendrier) des séances que la note dit annulées ou qui n'ont plus lieu (« finalement plus jeudi », « on annule mardi », « pas de séance lundi »). [] sinon. Ne devine pas.\n- \"objectifs\" : les objectifs du patient que la note énonce ou modifie (« nouvel objectif : courir 20 minutes », « objectif : se coiffer sans douleur », « on vise la reprise du tennis en mars »), un par item, avec ses mots. Pas ce qui est prévu pour la prochaine séance. [] s'il n'y en a pas.\n- \"fin_traitement\" : " + CONSIGNE_FIN + "\nExemple : {\"propre\":\"État du patient : douleur en baisse, 3/10.\\nFait en séance : renforcement des extenseurs.\\nÀ venir : tester la force en rotation externe, dans une semaine à 8 h.\",\"resume\":\"Tester la force en rotation externe.\",\"bref\":\"Douleur 3/10, en baisse. Renforcement des extenseurs.\",\"rdv_date\":\"2026-01-15\",\"rdv_heure\":\"08:00\",\"rdv_demi\":\"matin\",\"rdv_autres\":[],\"rdv_annules\":[],\"objectifs\":[],\"fin_traitement\":false}\n\nNote complète :\n" + contenu.slice(0, MAX_SEANCE) + (brut ? "\n\nPrévu :\n" + brut.slice(0, 4e3) : "");
}
const REGLE_JOUR = "Un jour de la semaine (« mardi », « mardi prochain ») désigne le premier jour de ce nom APRÈS J (dit un lundi, « mardi prochain » est le lendemain) ; « mardi en huit » ou « mardi de la semaine prochaine » : le mardi de la semaine qui suit celle de J.";
const CONSIGNE_FIN = "true seulement si la note dit clairement que le traitement s'arrête : « dernière séance », « fin de traitement », « fin de prise en charge », « fin des soins », « on arrête les séances ». false sinon, et aussi s'il est seulement question d'une pause, d'un arrêt à discuter ou d'un report.";
const CONSIGNE_DEMI = "« matin » ou « après-midi » si la note le dit pour cette prochaine séance (ou si l'heure annoncée le dit : avant 13 h, matin), sinon null.";
const okDemi = (v, heure) => {
	const t = typeof v === "string" ? v.toLowerCase() : "";
	return /apr[eè]s/.test(t) ? "pm" : /matin/.test(t) ? "am" : heure ? heure < "13:00" ? "am" : "pm" : "";
};
const okDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
const okHeure = (v) => {
	const m = typeof v === "string" && /^(\d{1,2})[:hH](\d{2})$/.exec(v.trim());
	return m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, "0") + ":" + m[2] : "";
};
function lireAnalyse(x, contenu, sansPropre) {
	const o = x && typeof x === "object" ? x : {};
	const resume = typeof o.resume === "string" ? o.resume.trim().replace(/^["«\s]+|["»\s]+$/g, "").replace(/^[àa] venir\s*:\s*/i, "").slice(0, 400) : "";
	const pr = !sansPropre && typeof o.propre === "string" ? o.propre.trim() : "";
	const rdvDate = okDate(o.rdv_date);
	const vus = new Set(rdvDate ? [rdvDate] : []);
	const autres = (Array.isArray(o.rdv_autres) ? o.rdv_autres : []).map((e) => {
		const it = e && typeof e === "object" ? e : {};
		return {
			d: okDate(it.date),
			demi: okDemi(it.demi, "")
		};
	}).filter((x) => x.d && !vus.has(x.d) && (vus.add(x.d), true)).slice(0, 10);
	const annules = [...new Set((Array.isArray(o.rdv_annules) ? o.rdv_annules : []).map(okDate))].filter((d) => d && !vus.has(d)).slice(0, 10);
	return {
		propre: pr && pr.length >= contenu.length * .35 ? pr : "",
		resume: avenirFrom(contenu) ? resume : "",
		bref: typeof o.bref === "string" ? o.bref.trim().slice(0, 300) : "",
		rdvDate,
		rdvHeure: rdvDate ? okHeure(o.rdv_heure) : "",
		rdvDemi: rdvDate ? okDemi(o.rdv_demi, okHeure(o.rdv_heure)) : "",
		fin: o.fin_traitement === true && !rdvDate && !autres.length,
		autres,
		annules,
		objectifs: (Array.isArray(o.objectifs) ? o.objectifs : []).filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 12)
	};
}
async function analyserSeance(cle, date, contenu, sansPropre, appel) {
	verifierLongueur(contenu, MAX_SEANCE, "seance");
	const r = await appel({
		cle,
		system: "Tu remets au propre les notes de séance d'un kinésithérapeute, sans rien ajouter ni retirer.",
		contenu: [{
			type: "text",
			text: promptSeance(date, contenu, sansPropre)
		}],
		schema: SCHEMA_SEANCE,
		effort: "medium",
		maxTokens: 16e3,
		niveau: "leger"
	});
	return {
		donnees: lireAnalyse(r.donnees, contenu, sansPropre),
		usage: r.usage
	};
}
const SEANCE_DICTEE = {
	type: "object",
	additionalProperties: false,
	required: [
		"nom",
		"extrait",
		"propre",
		"resume",
		"bref",
		"rdv_date",
		"rdv_heure",
		"rdv_demi",
		"rdv_autres",
		"rdv_annules",
		"objectifs",
		"fin_traitement"
	],
	properties: {
		nom: texteOuNul,
		extrait: { type: "string" },
		propre: texteOuNul,
		resume: texteOuNul,
		bref: texteOuNul,
		rdv_date: texteOuNul,
		rdv_heure: texteOuNul,
		rdv_demi: texteOuNul,
		rdv_autres: RDV_AUTRES,
		rdv_annules: RDV_ANNULES,
		objectifs: OBJECTIFS,
		fin_traitement: { type: "boolean" }
	}
};
const SCHEMA_DICTEE = {
	type: "object",
	additionalProperties: false,
	required: ["seances"],
	properties: { seances: {
		type: "array",
		items: SEANCE_DICTEE
	} }
};
function promptDictee(date, texte, patients) {
	return "Tu aides un kinésithérapeute. Voici une dictée groupée : il a dicté à la suite les séances de plusieurs patients, toutes du " + date + " (J). Une dictée peut contenir des mots mal reconnus (les prénoms aussi : « marque » pour « Marc »), peu de ponctuation, des hésitations et des répétitions.\n\nPatients enregistrés dans son appli (prénom et initiale) :\n" + (patients.length ? [...patients].sort((a, b) => Number(b.vuCeJour) - Number(a.vuCeJour)).slice(0, 400).map((p) => "- " + p.label + (p.vuCeJour ? " (rendez-vous ce jour-là)" : "")).join("\n") : "(aucun)") + "\n\nCalendrier de repère, à utiliser pour toute date (ne calcule rien toi-même) :\n" + calendrier(date, 0, 70) + "\n\nDécoupe la dictée en une entrée par patient, dans l'ordre de la dictée. Il annonce chaque patient par son prénom, parfois suivi d'une initiale (« Avec Marc D. », « ensuite Élisabeth G. », « pour Lucie »). Si le même patient revient plus loin, réunis ses passages dans une seule entrée. Un passage qui ne concerne aucun patient nommé forme une entrée avec nom null. Aucun passage de la dictée ne doit être perdu.\nPour chaque entrée, huit champs :\n- \"nom\" : le patient tel qu'il est annoncé. S'il correspond manifestement à un patient de la liste, écris-le exactement comme dans la liste ; sinon le prénom, et l'initiale si elle est dite. Jamais de nom de famille complet. null si aucun patient n'est nommé.\n- \"extrait\" : le texte dicté pour ce patient, mot pour mot, sans l'annonce de son nom (« Avec Marc D., » disparaît). Ne corrige rien, mais réduis tout nom de famille complet à son initiale suivie d'un point.\n- \"propre\" : cet extrait remis au propre. Corrige l'orthographe, la ponctuation et les mots manifestement mal reconnus par la dictée (termes d'anatomie et de kinésithérapie compris), retire hésitations et répétitions. Range chaque information sous la rubrique qui convient, dans cet ordre, une rubrique par ligne au format « Rubrique : texte », sans les rubriques vides : « État du patient » (ce que le patient rapporte, douleur, évolution depuis la dernière fois), « Fait en séance », « À faire à la maison », « Autres notes » (ce qui ne va nulle part ailleurs), « À venir » (ce qui est prévu pour la suite, y compris le moment de la prochaine séance s'il est dit, avec ses mots à lui). Règles strictes : n'ajoute aucune information, n'interprète pas, ne conclus pas, ne retire aucune information, garde les chiffres et le vocabulaire du kinésithérapeute, phrases courtes. Si un mot reste incompréhensible, garde-le tel quel suivi de « (?) ». Si un nom de famille complet apparaît, réduis-le à son initiale suivie d'un point.\n- \"resume\" : si l'extrait contient ce qui est prévu pour la prochaine séance (après « pour la prochaine séance », « pour la prochaine », « la prochaine fois » ou « à venir : »), un résumé très court (25 mots maximum, style télégraphique) de ce qui est prévu, sans la date ni l'heure du rendez-vous. N'ajoute rien. Sinon null.\n- \"bref\" : résumé très court (20 mots maximum, style télégraphique) de la séance : état du patient et ce qui a été fait, avec ses chiffres (douleur, amplitudes). Pas ce qui est prévu pour la suite. N'ajoute rien, n'interprète pas. null si la note est vide.\n- \"rdv_date\" : si l'extrait dit quand aura lieu la prochaine séance de ce patient, la date lue dans le calendrier, au format AAAA-MM-JJ, comptée à partir de J. Un jour de la semaine (« mardi », « mardi prochain ») désigne le premier jour de ce nom APRÈS J (dit un lundi, « mardi prochain » est le lendemain) ; « mardi en huit » ou « mardi de la semaine prochaine » : le mardi de la semaine qui suit celle de J. null si ce n'est pas dit ou si c'est ambigu. Ne devine pas.\n- \"rdv_heure\" : l'heure annoncée de cette prochaine séance au format HH:MM, sinon null.\n- \"rdv_demi\" : « matin » ou « après-midi » si la note le dit pour cette prochaine séance (ou si l'heure annoncée le dit : avant 13 h, matin), sinon null.\n- \"rdv_autres\" : les AUTRES séances à venir annoncées en plus de rdv_date (« lundi, mardi et jeudi prochain » : rdv_date = la première, rdv_autres = les suivantes), chacune {\"date\": AAAA-MM-JJ lue dans le calendrier, \"demi\": « matin », « après-midi » ou null si ce n'est pas dit pour ce jour-là}. [] s'il n'y en a pas. Ne devine pas.\n- \"rdv_annules\" : les dates (AAAA-MM-JJ, lues dans le calendrier) des séances que la note dit annulées ou qui n'ont plus lieu (« finalement plus jeudi », « on annule mardi », « pas de séance lundi »). [] sinon. Ne devine pas.\n- \"objectifs\" : les objectifs du patient que la note énonce ou modifie (« nouvel objectif : courir 20 minutes », « objectif : se coiffer sans douleur », « on vise la reprise du tennis en mars »), un par item, avec ses mots. Pas ce qui est prévu pour la prochaine séance. [] s'il n'y en a pas.\n- \"fin_traitement\" : true seulement si la note dit clairement que le traitement s'arrête : « dernière séance », « fin de traitement », « fin de prise en charge », « fin des soins », « on arrête les séances ». false sinon, et aussi s'il est seulement question d'une pause, d'un arrêt à discuter ou d'un report.\nExemple : {\"seances\":[{\"nom\":\"Marc D.\",\"extrait\":\"douleur 3 sur 10 on a fait du renforcement des rotateurs externes pour la prochaine séance tester la force dans une semaine à 8 heures\",\"propre\":\"État du patient : douleur 3/10.\\nFait en séance : renforcement des rotateurs externes.\\nÀ venir : tester la force, dans une semaine à 8 h.\",\"resume\":\"Tester la force.\",\"bref\":\"Douleur 3/10. Renforcement des rotateurs externes.\",\"rdv_date\":\"2026-01-15\",\"rdv_heure\":\"08:00\",\"rdv_demi\":\"matin\",\"rdv_autres\":[],\"rdv_annules\":[],\"objectifs\":[],\"fin_traitement\":false}]}\n\nDictée :\n" + texte.slice(0, MAX_DICTEE);
}
function lireDictee(x, texte) {
	const o = x && typeof x === "object" ? x : {};
	const seances = (Array.isArray(o.seances) ? o.seances : []).map((e) => {
		const it = e && typeof e === "object" ? e : {};
		const contenu = typeof it.extrait === "string" ? it.extrait.trim() : "";
		return {
			nom: typeof it.nom === "string" && it.nom.trim() ? it.nom.trim() : null,
			contenu,
			...lireAnalyse(it, contenu, false)
		};
	}).filter((s) => s.contenu);
	const total = seances.reduce((n, s) => n + s.contenu.length, 0);
	if (!seances.length || total < texte.trim().length * .6) throw new ErreurIA("L'IA a laissé de côté une partie de la dictée. Rien n'a été rangé.", "passager");
	return seances;
}
async function decouperDictee(cle, date, texte, patients, appel) {
	verifierLongueur(texte, MAX_DICTEE, "dictee");
	const r = await appel({
		cle,
		system: "Tu ranges la dictée groupée d'un kinésithérapeute, patient par patient, sans rien ajouter ni retirer.",
		contenu: [{
			type: "text",
			text: promptDictee(date, texte, patients)
		}],
		schema: SCHEMA_DICTEE,
		effort: "medium",
		maxTokens: 32e3,
		niveau: "puissant"
	});
	return {
		donnees: lireDictee(r.donnees, texte),
		usage: r.usage
	};
}

//#endregion
//#region src/rangement.ts
function patchAnalyse(se, a, brut) {
	const patch = { ia_ok: true };
	if (brut && a.resume) {
		patch.avenir_resume = a.resume;
		patch.avenir_source = empreinteTexte(brut);
	}
	if (a.propre) {
		patch.propre = a.propre;
		patch.propre_source = empreinteTexte(se.contenu);
	}
	if (a.bref) {
		patch.bref = a.bref;
		patch.bref_source = empreinteTexte(se.contenu);
	}
	return patch;
}
function analyseSurDossier(d, seances, se, a, auj, jour) {
	if (!!seances.some((x) => x.dossierId === se.dossierId && x.id !== se.id && x.date > se.date)) return {
		dossier: d,
		message: null
	};
	if (a.fin) return {
		dossier: {
			...d,
			fin: se.date
		},
		message: "Fin de traitement notée pour " + d.label + " : dossier archivé (« Rouvrir le dossier » sur sa fiche en cas d'erreur)."
	};
	let D = d;
	const messages = [];
	const dictes = [...a.rdvDate ? [{
		d: a.rdvDate,
		h: a.rdvHeure,
		demi: a.rdvDemi
	}] : [], ...(a.autres ?? []).map((x) => ({
		d: x.d,
		h: "",
		demi: x.demi
	}))].filter((x) => x.d >= auj);
	if (dictes.length) {
		const rdvs = poserRdvs(d.rdvs ?? [], dictes, demiSeance(d.rdvs ?? [], se.date));
		D = {
			...D,
			rdvs
		};
		if (d.retirer?.some((j) => dictes.some((x) => x.d === j))) D = {
			...D,
			retirer: (d.retirer ?? []).filter((j) => !dictes.some((x) => x.d === j))
		};
		const jours = dictes.map((x) => {
			const r = rdvs.find((y) => y.d === x.d), dm = r ? demiDe(r) : null;
			return jour(x.d) + (dm ? " " + DEMI_FR[dm] : "");
		});
		messages.push((jours.length > 1 ? "Rendez-vous repérés pour " : "Rendez-vous repéré pour ") + d.label + " : " + jours.join(", ") + ".");
	}
	const annules = (a.annules ?? []).filter((j) => j >= auj && (d.rdvs ?? []).some((r) => r.d === j));
	if (annules.length) {
		D = {
			...D,
			retirer: [.../* @__PURE__ */ new Set([...D.retirer ?? [], ...annules])]
		};
		messages.push("Rendez-vous dit annulé pour " + d.label + " : " + annules.map(jour).join(", ") + ". À confirmer.");
	}
	if (a.objectifs?.length) {
		D = {
			...D,
			objectifs_propose: {
				liste: a.objectifs,
				date: se.date
			}
		};
		messages.push("Objectif dit pour " + d.label + " : à confirmer sur sa fiche.");
	}
	return {
		dossier: D,
		message: messages.length ? messages.join(" ") : null
	};
}
function rouvrirApres(d, date) {
	if (!d.fin || date <= d.fin) return d;
	const { fin: _, ...reste } = d;
	return reste;
}
function rangerMorceaux(dossiers, seances, date, morceaux, o) {
	const parId = new Map(dossiers.map((d) => [d.id, d]));
	const changes = /* @__PURE__ */ new Set();
	const toutes = [...seances];
	const r = {
		seances: [],
		dossiers: [],
		ranges: [],
		doutes: [],
		rdvs: []
	};
	for (const m of morceaux) {
		const { dossier, candidats } = rattacher(m.nom, dossiers, date);
		if (!dossier) {
			r.doutes.push({
				id: o.nouvelId(),
				date,
				seance: m,
				candidats: candidats.map((d) => d.id)
			});
			continue;
		}
		const placee = placerSeance(parId.get(dossier.id), toutes, date, m, o);
		parId.set(dossier.id, placee.dossier);
		changes.add(dossier.id);
		toutes.push(placee.seance);
		r.seances.push(placee.seance);
		r.ranges.push({
			seanceId: placee.seance.id,
			dossierId: dossier.id,
			prenomSeul: !dossier.rdvs.some((x) => x && x.d === date)
		});
		if (placee.message) r.rdvs.push(placee.message);
	}
	r.dossiers = [...changes].map((id) => parId.get(id));
	return r;
}
function placerSeance(d, seances, date, m, o) {
	const brute = {
		id: o.nouvelId(),
		dossierId: d.id,
		date,
		contenu: m.contenu,
		cree: o.cree,
		...o.origine ? { origine: o.origine } : {}
	};
	const seance = {
		...brute,
		...patchAnalyse(brute, m, avenirFrom(m.contenu))
	};
	const { dossier, message } = analyseSurDossier(rouvrirApres(d, date), [...seances, seance], seance, m, o.auj, o.jour);
	return {
		seance,
		dossier,
		message
	};
}

//#endregion
//#region src/pc/travail.ts
const VERSION = 1;
const CLE = "parametres/travaux";
const ESSAIS_MAX = 24;
const delaiEssai = (essais) => [
	5,
	15,
	30
][essais - 1] ?? 60;
const ARRIVEE_MAX_MS = 9e5;
const GARDE_JOURS = 14;
const GARDES_MAX = 40;
const enCours = (t) => t.etat === "attente" || t.etat === "transcription" || t.etat === "rangement";
function elaguer(liste, maintenant) {
	const limite = (/* @__PURE__ */ new Date(maintenant.getTime() - GARDE_JOURS * 864e5)).toISOString();
	const tri = [...liste].sort((a, b) => b.cree.localeCompare(a.cree));
	let gardes = 0;
	return tri.filter((t) => enCours(t) || t.doutes?.length || t.cree >= limite && ++gardes <= GARDES_MAX).reverse();
}
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
function lireDemande(x) {
	const o = x && typeof x === "object" ? x : {};
	const str = (v, max) => typeof v === "string" && v.length <= max ? v : void 0;
	const type = o.type === "dictee" || o.type === "seance" || o.type === "analyse" ? o.type : null;
	const id = str(o.id, 64), date = str(o.date, 10);
	if (!type || !id || !ID.test(id) || !date || !JOUR.test(date)) return null;
	const d = {
		id,
		type,
		date
	};
	for (const [k, max] of [
		["appareil", 100],
		["texte", 2e5],
		["debut", 2e5],
		["dossierId", 100],
		["seanceId", 100],
		["empreinte", 100]
	]) {
		const v = str(o[k], max);
		if (v !== void 0) d[k] = v;
	}
	if (o.sansPropre === true) d.sansPropre = true;
	if (type === "seance" && !d.dossierId) return null;
	if (type === "analyse" && !d.seanceId) return null;
	return d;
}
const nettoyer = (v) => JSON.parse(JSON.stringify(v));
function creer(env) {
	const maintenant = () => env.maintenant?.() ?? /* @__PURE__ */ new Date();
	const nouvelId = () => crypto.randomUUID();
	const travaux = (l) => l.lire("parametres/travaux")?.travaux ?? [];
	const avec = (l, t) => ({
		cle: CLE,
		valeur: nettoyer({ travaux: elaguer([...travaux(l).filter((x) => x.id !== t.id), t], maintenant()) })
	});
	const dossiers = (l) => l.liste("dossiers/");
	const seances = (l) => l.liste("seances/");
	const maj = (id, f) => env.transaction((l) => {
		const t = travaux(l).find((x) => x.id === id);
		return t ? [avec(l, f(t))] : [];
	});
	let reveil = () => {};
	const reveiller = () => reveil();
	async function recevoir(d, son) {
		const deja = travaux(env).find((x) => x.id === d.id);
		if (deja) return deja;
		if (d.type !== "analyse" && !d.texte && !son) throw new ErreurIA("Ni texte ni enregistrement.");
		if (son) await env.sons.garder(d.id, son);
		const t = {
			...d,
			cree: maintenant().toISOString(),
			etat: "attente",
			essais: 0,
			...son && !d.texte ? { son: true } : {}
		};
		await env.transaction((l) => travaux(l).some((x) => x.id === d.id) ? [] : [avec(l, t)]);
		reveiller();
		return travaux(env).find((x) => x.id === d.id) ?? t;
	}
	async function executer(t0) {
		const ia = env.ia();
		const id = t0.id;
		try {
			if (!ia) throw new ErreurIA("Le PC ne connaît pas encore le code d'accès au serveur de l'appli.");
			const appel = env.appel ?? appelAbonnementVers(ia.adresse);
			let t = t0;
			if (t.type !== "analyse" && !t.texte) t = await transcrire(t);
			else await maj(id, (x) => ({
				...x,
				etat: "rangement",
				essais: x.essais + 1
			}));
			if (t.type === "dictee") await rangerDictee(t, ia.code, appel);
			else await mettreAuPropre(t, ia.code, appel);
		} catch (e) {
			const message = e instanceof ErreurIA ? e.message : "Le travail n'a pas abouti sur le PC.";
			const nature = natureDe(e);
			const pasArrivee = e instanceof PasArrivee;
			if (!(e instanceof ErreurIA)) env.noter("Travail interrompu : " + String(e?.message || e));
			await maj(id, (x) => {
				if (nature === "definitif" || x.essais >= 24) return {
					...x,
					etat: "erreur",
					erreur: message,
					prochain: void 0
				};
				const ms = env.delai?.(x.essais) ?? (pasArrivee ? 2e4 : delaiEssai(x.essais) * 6e4);
				return {
					...x,
					etat: "attente",
					erreur: message,
					prochain: new Date(maintenant().getTime() + ms).toISOString()
				};
			}).catch(() => {});
		}
	}
	async function transcrire(t) {
		await maj(t.id, (x) => ({
			...x,
			etat: "transcription",
			essais: x.essais + 1
		}));
		const son = await env.sons.lire(t.id);
		if (!son) throw new ErreurIA("L'enregistrement n'est plus sur le PC.");
		const noms = t.type === "dictee" ? [...new Set(rdvsDuJour(dossiers(env), t.date).map((r) => r.dossier.label))] : [env.lire("dossiers/" + t.dossierId)?.label ?? ""].filter(Boolean);
		let brut;
		try {
			brut = nettoyerVoix(await env.transcrire(son, JSON.stringify(indiceVoix(noms) ?? {})));
		} catch (e) {
			throw new ErreurIA(e?.message || "Whisper n'a pas répondu sur le PC.", e.nature ?? "passager");
		}
		if (!brut) throw new ErreurIA("Rien n'a été compris dans l'enregistrement.");
		const texte = t.debut?.trim() ? t.debut.trimEnd() + "\n" + brut : brut;
		let suite = null, introuvable = false;
		await env.transaction((l) => {
			const x = travaux(l).find((y) => y.id === t.id);
			if (!x) return [];
			const ecr = [];
			suite = {
				...x,
				texte,
				etat: "rangement",
				son: false
			};
			if (t.type === "dictee") ecr.push(garderDictee(l, t.date, texte));
			if (t.type === "seance") {
				const d = l.lire("dossiers/" + t.dossierId);
				if (d) {
					const s = {
						id: nouvelId(),
						dossierId: d.id,
						date: t.date,
						contenu: texte,
						cree: maintenant().toISOString()
					};
					ecr.push({
						cle: "seances/" + s.id,
						valeur: s
					});
					const rouvert = rouvrirApres(d, t.date);
					if (rouvert !== d) ecr.push({
						cle: "dossiers/" + d.id,
						valeur: rouvert
					});
					suite = {
						...suite,
						seanceId: s.id,
						empreinte: empreinteTexte(texte)
					};
				} else introuvable = true;
			}
			ecr.push(avec(l, suite));
			return ecr;
		});
		await env.sons.oublier(t.id).catch(() => {});
		if (!suite) throw new ErreurIA("Travail abandonné sur un appareil.");
		if (introuvable) throw new ErreurIA("Ce patient n'est plus dans Muninn : la séance n'a pas pu être rangée. Son texte est gardé.");
		return suite;
	}
	function garderDictee(l, date, texte) {
		const liste = l.lire("parametres/dictees")?.dictees ?? [];
		const t = texte.trim();
		if (liste.some((x) => x.date === date && x.texte === t)) return {
			cle: "parametres/dictees",
			valeur: { dictees: liste }
		};
		return {
			cle: "parametres/dictees",
			valeur: { dictees: [...liste, {
				id: nouvelId(),
				date,
				cree: maintenant().toISOString(),
				texte: t
			}].sort((a, b) => a.cree.localeCompare(b.cree)).slice(-30) }
		};
	}
	async function rangerDictee(t, code, appel) {
		const patients = dossiers(env).filter((d) => !estArchive(d)).map((d) => ({
			label: d.label,
			vuCeJour: d.rdvs.some((r) => r && r.d === t.date)
		}));
		const { donnees: morceaux } = await decouperDictee(code, t.date, t.texte, patients, appel);
		await env.transaction((l) => {
			const x = travaux(l).find((y) => y.id === t.id);
			if (!x || !enCours(x)) return [];
			const avant = dossiers(l);
			const r = rangerMorceaux(avant, seances(l), t.date, morceaux, {
				nouvelId,
				cree: maintenant().toISOString(),
				auj: isoDay(maintenant()),
				jour: jourLong
			});
			const parId = new Map(avant.map((d) => [d.id, d]));
			const rdvs_avant = {}, rdvs_apres = {};
			for (const d of r.dossiers) {
				rdvs_avant[d.id] = parId.get(d.id)?.rdvs ?? [];
				rdvs_apres[d.id] = d.rdvs;
			}
			return [
				...r.seances.map((s) => ({
					cle: "seances/" + s.id,
					valeur: s
				})),
				...r.dossiers.map((d) => ({
					cle: "dossiers/" + d.id,
					valeur: d
				})),
				avec(l, {
					...x,
					etat: "fini",
					fini: maintenant().toISOString(),
					erreur: void 0,
					prochain: void 0,
					ranges: r.ranges,
					doutes: r.doutes,
					rdvs: r.rdvs,
					rdvs_avant,
					rdvs_apres
				})
			];
		});
	}
	async function mettreAuPropre(t, code, appel) {
		const s = env.lire("seances/" + t.seanceId);
		const finir = (rdvs = []) => maj(t.id, (x) => ({
			...x,
			etat: "fini",
			fini: maintenant().toISOString(),
			erreur: void 0,
			prochain: void 0,
			rdvs
		}));
		if (!s) {
			if (maintenant().getTime() - new Date(t.cree).getTime() < ARRIVEE_MAX_MS) throw new PasArrivee();
			return finir();
		}
		if (t.empreinte && empreinteTexte(s.contenu) !== t.empreinte) return finir();
		const { donnees: a } = await analyserSeance(code, s.date, s.contenu, !!t.sansPropre, appel);
		await env.transaction((l) => {
			const x = travaux(l).find((y) => y.id === t.id);
			const s2 = l.lire("seances/" + s.id);
			if (!x || !enCours(x)) return [];
			const fini = {
				...x,
				etat: "fini",
				fini: maintenant().toISOString(),
				erreur: void 0,
				prochain: void 0,
				rdvs: []
			};
			if (!s2 || s2.contenu !== s.contenu) return [avec(l, fini)];
			const se = {
				...s2,
				...patchAnalyse(s2, a, avenirFrom(s2.contenu))
			};
			const ecr = [{
				cle: "seances/" + se.id,
				valeur: se
			}];
			const d = l.lire("dossiers/" + se.dossierId);
			if (d) {
				const toutes = seances(l).map((y) => y.id === se.id ? se : y);
				const r = analyseSurDossier(d, toutes, se, a, isoDay(maintenant()), jourLong);
				if (r.dossier !== d) ecr.push({
					cle: "dossiers/" + d.id,
					valeur: r.dossier
				});
				if (r.message) fini.rdvs = [r.message];
			}
			ecr.push(avec(l, fini));
			return ecr;
		});
	}
	let arret = false, boucleEnCours = null;
	const prets = () => travaux(env).filter((t) => enCours(t) && (!t.prochain || t.prochain <= maintenant().toISOString())).sort((a, b) => a.cree.localeCompare(b.cree));
	async function nettoyerSons() {
		const gardes = new Set(travaux(env).filter((t) => enCours(t) && t.son).map((t) => t.id));
		for (const id of await env.sons.liste().catch(() => [])) if (!gardes.has(id)) await env.sons.oublier(id).catch(() => {});
	}
	function demarrer() {
		boucleEnCours ??= (async () => {
			await nettoyerSons();
			while (!arret) {
				const t = prets()[0];
				if (t) {
					await executer(t);
					await nettoyerSons();
					continue;
				}
				const prochains = travaux(env).filter((x) => enCours(x) && x.prochain).map((x) => new Date(x.prochain).getTime());
				const attente = Math.max(1e3, Math.min(6e4, ...prochains.map((p) => p - maintenant().getTime())));
				await new Promise((r) => {
					const m = setTimeout(r, attente);
					reveil = () => {
						clearTimeout(m);
						r();
					};
				});
				reveil = () => {};
			}
		})();
		return boucleEnCours;
	}
	function arreter() {
		arret = true;
		reveiller();
		return boucleEnCours ?? Promise.resolve();
	}
	const etat = () => ({
		version: 1,
		enCours: travaux(env).filter(enCours).length
	});
	return {
		recevoir,
		demarrer,
		arreter,
		reveiller,
		etat
	};
}
var PasArrivee = class extends ErreurIA {
	constructor() {
		super("La séance n'est pas encore arrivée sur le PC.", "passager");
	}
};

//#endregion
export { CLE, ESSAIS_MAX, VERSION, creer, delaiEssai, elaguer, lireDemande };