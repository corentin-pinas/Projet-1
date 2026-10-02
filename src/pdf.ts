/* Lecteur PDF, chargé seulement à l'ouverture d'un bilan. Le moteur de lecture est livré avec l'appli : il marche sans internet. */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export { pdfjs };
