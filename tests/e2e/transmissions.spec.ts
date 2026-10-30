import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

/* Transmissions pour un remplaçant. Horloge fixée au vendredi 30 octobre 2026 : la période proposée est la semaine prochaine (2 au 8 novembre). */
test("transmissions : période, patients cochés, jours vides signalés, PDF fidèle", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-30T18:00:00"));
  await page.goto("/");
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients", 3); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const tx = db.transaction(["dossiers", "bilans", "seances"], "readwrite");
    tx.objectStore("dossiers").put({ id: "a", label: "Marc D.", rdvs: [{ d: "2026-11-03", h: "09:00" }, { d: "2026-11-05", h: "10:00" }], homonyme: false, cree: "" });
    tx.objectStore("dossiers").put({ id: "b", label: "Lucie M.", rdvs: [{ d: "2026-11-02", h: "08:20", t: "bilan" }], homonyme: false, cree: "" });
    tx.objectStore("dossiers").put({ id: "c", label: "Paul G.", rdvs: [{ d: "2026-11-20", h: "09:00" }], homonyme: false, cree: "" });
    tx.objectStore("bilans").put({ id: "ba", dossierId: "a", fichier: "Bilan Marc D", fichiers: [], ajoute: "2026-10-05T10:00:00Z", valides: [], corrections: [],
      resume: { region: "Épaule D", date_bilan: "05/10/2026", age: 52, coup_oeil: "Tendinopathie du supra-épineux droit.", chiffres: [{ label: "EVA", valeur: "4/10" }], sections: [{ titre: "Antécédents", items: ["Luxation 2019"] }], a_verifier: [] } });
    tx.objectStore("seances").put({ id: "s1", dossierId: "a", date: "2026-10-27", cree: "2026-10-27T10:00:00Z", contenu: "renfo RE. Pour la prochaine séance excentrique des rotateurs externes" });
    tx.commit(); await new Promise(ok => tx.oncomplete = ok);
  });
  await page.reload();

  await page.getByRole("button", { name: "Agenda" }).click();
  await page.getByRole("button", { name: "Transmissions" }).click();
  const v = page.getByRole("dialog", { name: "Transmissions pour un remplaçant" });
  await expect(v.locator("#tdu")).toHaveValue("2026-11-02");
  await expect(v.locator("#tau")).toHaveValue("2026-11-08");
  await expect(v.locator(".tpatient")).toHaveCount(2);                       // Paul G. (le 20) n'est pas dans la période
  await expect(v.locator(".tpatient").first()).toContainText("Lucie M.");     // ordre du premier rendez-vous
  await expect(v.locator(".tpatient").first()).toContainText("Bilan à venir");
  await expect(v.locator(".tvides")).toContainText("mer. 4 nov.");             // jours travaillés sans rendez-vous

  await v.getByRole("button", { name: "3 semaines" }).click();
  await expect(v.locator(".tpatient")).toHaveCount(3);
  await v.getByRole("button", { name: "1 semaine" }).click();
  await v.locator('[data-inclus="b"]').uncheck();
  await expect(v.locator(".tcompte")).toContainText("1 dans le PDF");
  await v.locator("#tmot").fill("Code de la porte : 1234");

  const telechargement = page.waitForEvent("download");
  await v.getByRole("button", { name: "Enregistrer le PDF" }).click();
  const d = await telechargement;
  expect(d.suggestedFilename()).toBe("Transmissions du 02-11 au 08-11.pdf");
  const pdf = (await readFile((await d.path())!)).toString("latin1");
  expect(pdf.startsWith("%PDF")).toBe(true);
  for (const t of ["Transmissions", "Marc D., 52 ans", "Code de la porte : 1234", "Tendinopathie du supra-", "Antécédents : Luxation 2019", "Excentrique des rotateurs externes"])
    expect(pdf).toContain(t);
  expect(pdf).not.toContain("Lucie M.");

  // le mot est gardé pour la prochaine fois
  await v.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Agenda" }).click();
  await page.getByRole("button", { name: "Transmissions" }).click();
  await expect(page.locator("#tmot")).toHaveValue("Code de la porte : 1234");
});
