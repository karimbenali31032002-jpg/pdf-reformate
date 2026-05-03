import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import fileUpload from "express-fileupload";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

// Import ultra-robuste pour @google/genai
let GoogleGenerativeAI;
try {
  const genaiModule = require("@google/genai");
  GoogleGenerativeAI = genaiModule.GoogleGenerativeAI;
} catch (e) {
  console.error("Erreur d'importation @google/genai:", e);
}

import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType, 
  BorderStyle, 
  ShadingType,
  TableOfContents
} from "docx";

// --- CONFIG ---
const PORT = 3000;

// On initialise l'IA de manière paresseuse pour éviter de planter si la clé est manquante au départ
let genAI: GoogleGenerativeAI | null = null;
function getModel() {
  if (!genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY non configurée dans .env.local");
    }
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
}

// --- COLORS FROM SKILL ---
const COLORS = {
  primary:       "1F3864",  // Bleu marine
  secondary:     "2E75B6",  // Bleu moyen
  accent:        "D6E4F0",  // Bleu pâle
  altRow:        "EBF3FB",  // Bleu très pâle
  warning:       "FFF3E0",  // Orange pâle
  warningBorder: "E67E22",  // Orange
  keyterm:       "1A5276",  // Bleu foncé
  danger:        "C0392B",  // Rouge
  border:        "ADB9CA",  // Gris bleu
  caption:       "666666",  // Gris
  text:          "1A1A1A",  // Quasi-noir
};

// --- HELPERS ---
async function analyzeTextWithGemini(text: string) {
  const prompt = `
    Tu es un assistant expert en structuration de cours médicaux (résidanat).
    Voici le texte brut extrait d'un PDF de cours :
    
    """
    ${text.slice(0, 30000)} // Limiting to avoid token issues
    """
    
    Analyse ce cours et retourne un objet JSON structuré comme suit :
    {
      "title": "Titre du cours",
      "matter": "Matière",
      "objectives": ["Objectif 1", "Objectif 2"],
      "sections": [
        {
          "level": 1,
          "title": "Introduction",
          "content": [
            { "type": "paragraph", "text": "Le texte..." },
            { "type": "list", "items": ["Item 1", "Item 2"] },
            { "type": "important", "text": "À retenir..." },
            { "type": "alert", "text": "Attention..." }
          ]
        }
      ],
      "keyTerms": ["terme1", "terme2"] // Liste des termes médicaux importants à mettre en gras/couleur
    }
    
    Règles :
    - Conserve le contenu exact.
    - Identifie bien les hiérarchies (Sections I, II, III... puis A, B, C... puis 1, 2, 3...).
    - Pour les termes clés, privilégie les noms d'organes, de signes cliniques, d'urgences et de traitements.
    - Réponds UNIQUEMENT avec le JSON.
  `;

  const model = getModel();
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Impossible de parser la réponse de l'IA");
  return JSON.parse(jsonMatch[0]);
}

function createRichParagraph(segments: any[]) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 276, after: 120 },
    children: segments.map((s: any) => new TextRun({
      font: "Arial",
      size: 22,
      text: s.text,
      bold: s.bold || false,
      color: s.color || COLORS.text,
      italics: s.italics || false,
    })),
  });
}

function enrichText(text: string, keyTerms: string[]) {
  // Simple regex-based highlighting for key terms
  let segments = [{ text: text, bold: false, color: COLORS.text }];
  
  for (const term of keyTerms) {
    const newSegments: any[] = [];
    segments.forEach(seg => {
      if (seg.bold) {
        newSegments.push(seg);
        return;
      }
      
      const parts = seg.text.split(new RegExp(`(${term})`, 'gi'));
      parts.forEach(part => {
        if (part.toLowerCase() === term.toLowerCase()) {
          newSegments.push({ text: part, bold: true, color: COLORS.keyterm });
        } else if (part !== "") {
          newSegments.push({ text: part, bold: false, color: COLORS.text });
        }
      });
    });
    segments = newSegments;
  }
  return segments;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(fileUpload());

  // API Route for reformatting
  app.post("/api/reformat", async (req, res) => {
    try {
      if (!req.files || !req.files.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const uploadedFile = req.files.file as any;
      console.log("File received:", uploadedFile.name, uploadedFile.size, "bytes");

      if (typeof pdf !== "function") {
        console.error("pdf-parse is not a function. Check imports.");
        return res.status(500).json({ error: "Configuration Error: pdf-parse is not correctly imported" });
      }

      let pdfData;
      try {
        pdfData = await pdf(uploadedFile.data);
      } catch (pdfErr) {
        console.error("PDF Parsing failed:", pdfErr);
        return res.status(500).json({ error: "PDF Parsing failed: " + (pdfErr instanceof Error ? pdfErr.message : String(pdfErr)) });
      }

      const rawText = pdfData?.text || "";
      console.log("Raw text extracted, length:", rawText.length);

      if (!rawText.trim()) {
        return res.status(400).json({ error: "The PDF seems to be empty or contains no extractable text." });
      }

      // AI Analysis
      let structuredCourse;
      try {
        console.log("Starting AI Analysis...");
        structuredCourse = await analyzeTextWithGemini(rawText);
        console.log("AI Analysis succeeded");
      } catch (aiError) {
        console.error("AI Analysis Failed:", aiError);
        return res.status(500).json({ error: "AI Analysis failed: " + (aiError instanceof Error ? aiError.message : String(aiError)) });
      }

      // Docx Generation
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            // Page de garde
            new Paragraph({
              text: (structuredCourse?.title || "Cours").trim(),
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
              spacing: { before: 2400, after: 600 },
            }),
            new Paragraph({
              text: (structuredCourse?.matter || "").trim(),
              alignment: AlignmentType.CENTER,
              spacing: { after: 2400 },
            }),
            
            new Paragraph({ text: "Table des Matières", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }),
            new TableOfContents("Sommaire", {
                hyperlink: true,
                numberOfContentsLines: 3,
            }),

            // Objectifs
            new Paragraph({ text: "Objectifs Pédagogiques", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }),
            ...(structuredCourse?.objectives || []).map((obj: string) => 
               new Paragraph({
                 text: obj,
                 bullet: { level: 0 },
                 spacing: { before: 120 },
               })
            ),

            // Sections
            ...(structuredCourse?.sections || []).flatMap((section: any) => {
              const nodes = [];
              const heading = section.level === 1 ? HeadingLevel.HEADING_1 : (section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3);
              
              nodes.push(new Paragraph({
                text: section.title || "Sans titre",
                heading: heading,
                spacing: { before: 400, after: 200 },
              }));

              (section.content || []).forEach((item: any) => {
                if (item.type === "paragraph") {
                  nodes.push(createRichParagraph(enrichText(item.text || "", structuredCourse?.keyTerms || [])));
                } else if (item.type === "list") {
                  (item.items || []).forEach((listItem: string) => {
                    nodes.push(new Paragraph({
                      text: listItem,
                      bullet: { level: 0 },
                    }));
                  });
                } else if (item.type === "important") {
                   nodes.push(new Paragraph({
                    spacing: { before: 160, after: 160 },
                    border: { left: { style: BorderStyle.SINGLE, size: 16, color: COLORS.secondary, space: 8 } },
                    shading: { fill: COLORS.accent, type: ShadingType.CLEAR },
                    children: [
                      new TextRun({ text: "À retenir — ", bold: true, font: "Arial", size: 22, color: COLORS.primary }),
                      new TextRun({ text: item.text || "", font: "Arial", size: 22, color: COLORS.primary }),
                    ],
                  }));
                } else if (item.type === "alert") {
                  nodes.push(new Paragraph({
                    spacing: { before: 160, after: 160 },
                    border: { left: { style: BorderStyle.SINGLE, size: 16, color: COLORS.warningBorder, space: 8 } },
                    shading: { fill: COLORS.warning, type: ShadingType.CLEAR },
                    children: [
                      new TextRun({ text: "⚠  ", bold: true, font: "Arial", size: 22, color: COLORS.warningBorder }),
                      new TextRun({ text: item.text || "", bold: true, font: "Arial", size: 22, color: "B7490A" }),
                    ],
                  }));
                }
              });

              return nodes;
            })
          ],
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader("Content-Disposition", `attachment; filename="reformate.docx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.send(buffer);

    } catch (error) {
      console.error("Critical Error in /api/reformat:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
