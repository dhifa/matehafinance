import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini Client server-side using modern @google/genai model guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

/**
 * Resilient Gemini content generation with automatic backoff retry and fallback models
 * to handle transient 503 (high demand / unavailable) or 429 (rate limit) spikes.
 */
async function generateContentWithFallback(params: {
  contents: any[];
  config: any;
  preferredModels?: string[];
}) {
  // Valid, active models according to Gemini API specifications
  const models = params.preferredModels || [
    "gemini-flash-latest",
    "gemini-3.7-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
  ];

  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      console.warn(`[Gemini Fallback] Model ${model} encountered error, trying next available model:`, errMsg);
      
      // Brief pause before trying next fallback model
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  throw lastError || new Error("Layanan AI sedang mengalami lonjakan trafik sementara. Silakan coba klik tombol scan kembali.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set higher limits for base64 image uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route: healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API Route: parse-rab-screenshot
  app.post("/api/gemini/parse-rab", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing image base64 data" });
      }

      // Check if API key is present
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please add it in Settings > Secrets.",
        });
      }

      // Format image part for Gemini inline data
      // Strips base64 header if present
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      
      const imagePart = {
        inlineData: {
          mimeType: "image/png",
          data: cleanBase64,
        },
      };

      const systemInstruction = `You are an expert financial spreadsheet analyzer and accountant assistant.
Your task is to parse a spreadsheet screenshot containing event financial records including "RANCANGAN ANGGARAN BIAYA PROJEK" (RAB, on the left side) and "REPORT ANGGARAN BIAYA PROJEK" (Realisasi, on the right side).

Key Guidelines:
1. There might be one or more projects visible in the screenshot. Each project starts with a thick colored header (usually green/blue) consisting of numbering and name, date, and location e.g. "1 | Seminar FGD Kemenperin | 13 November 2025, Sheraton" or "3 | BI JABAR Dokum kopi | 6 November 2025, Majalaya". Parse these header fields exactly:
   - name: The event's name (e.g., "Seminar FGD Kemenperin")
   - date: The event's date (e.g., "13 November 2025")
   - location: The event's location (e.g., "Sheraton")

2. For each project, extract:
   - A. Income (Pemasukan)
   - B. Details of Accommodation and Other Costs (Akomodasi / Pengeluaran)
   - C. Income Sharing (Mateha x Staff):
       - Extract "Mateha" percentage (e.g., 25% -> 25)
       - Extract "Production Staff Fees" percentage (e.g., 70% -> 70)
       - Extract "Investor" percentage (e.g., 5% -> 5)
   - D. Fee Distribution:
       - Extract individual roles (e.g., zoom op, operator, Cameraman, PIC EVENT), mapping description, qty, expense, and notes (the initials like "ai", "dhifo").
       - Note: Look closely at "PIC Bonus" (usually under block D, e.g. "PIC Bonus (5%)"). Parse that number as picBonusRatio (e.g. 5). Do NOT include the "PIC Bonus" row inside the feeDistribution items array itself, as that is a computed row, only parse its ratio percentage.
       
3. Ensure you parse numeric quantities ("qty") and money amounts ("expense" / Rp). Remove monetary symbols like Rp and formatting dots (e.g., "Rp4.000.000" becomes 4000000).
4. Ignore totals like "Total A", "Total B", "Total D", or "Total Mateha's Profit" rows.
5. Skip completely blank rows.
6. Since payment info like DP or Lunas is NOT on these spreadsheet tables, leave paymentStatus as default ("belum") and dpAmount as 0. Do not guess.`;

      const prompt = "Please analyze this spreadsheet and extract all the visible project events, listing their RAB and Realisasi details according to the requested JSON structure.";

      // Call Gemini with automatic fallback and retry for high demand / 503 resiliency
      const response = await generateContentWithFallback({
        contents: [imagePart, { text: prompt }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "Array of extracted projects",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                date: { type: Type.STRING },
                location: { type: Type.STRING },
                rab: {
                  type: Type.OBJECT,
                  properties: {
                    income: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          num: { type: Type.INTEGER },
                          description: { type: Type.STRING },
                          qty: { type: Type.INTEGER },
                          expense: { type: Type.INTEGER },
                          notes: { type: Type.STRING }
                        },
                        required: ["num", "description", "qty", "expense"]
                      }
                    },
                    accommodation: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          num: { type: Type.INTEGER },
                          description: { type: Type.STRING },
                          qty: { type: Type.INTEGER },
                          expense: { type: Type.INTEGER },
                          notes: { type: Type.STRING }
                        },
                        required: ["num", "description", "qty", "expense"]
                      }
                    },
                    sharingRatio: {
                      type: Type.OBJECT,
                      properties: {
                        mateha: { type: Type.INTEGER },
                        staff: { type: Type.INTEGER },
                        investor: { type: Type.INTEGER }
                      },
                      required: ["mateha", "staff", "investor"]
                    },
                    picBonusRatio: { type: Type.INTEGER, description: "Percentage of PIC Bonus (e.g. 5)" },
                    feeDistribution: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          num: { type: Type.INTEGER },
                          description: { type: Type.STRING },
                          qty: { type: Type.INTEGER },
                          expense: { type: Type.INTEGER },
                          notes: { type: Type.STRING }
                        },
                        required: ["num", "description", "qty", "expense"]
                      }
                    }
                  },
                  required: ["income", "accommodation", "feeDistribution", "sharingRatio", "picBonusRatio"]
                },
                realisasi: {
                  type: Type.OBJECT,
                  properties: {
                    income: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          num: { type: Type.INTEGER },
                          description: { type: Type.STRING },
                          qty: { type: Type.INTEGER },
                          expense: { type: Type.INTEGER },
                          notes: { type: Type.STRING }
                        },
                        required: ["num", "description", "qty", "expense"]
                      }
                    },
                    accommodation: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          num: { type: Type.INTEGER },
                          description: { type: Type.STRING },
                          qty: { type: Type.INTEGER },
                          expense: { type: Type.INTEGER },
                          notes: { type: Type.STRING }
                        },
                        required: ["num", "description", "qty", "expense"]
                      }
                    },
                    sharingRatio: {
                      type: Type.OBJECT,
                      properties: {
                        mateha: { type: Type.INTEGER },
                        staff: { type: Type.INTEGER },
                        investor: { type: Type.INTEGER }
                      },
                      required: ["mateha", "staff", "investor"]
                    },
                    picBonusRatio: { type: Type.INTEGER, description: "Percentage of PIC Bonus (e.g. 5)" },
                    feeDistribution: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          num: { type: Type.INTEGER },
                          description: { type: Type.STRING },
                          qty: { type: Type.INTEGER },
                          expense: { type: Type.INTEGER },
                          notes: { type: Type.STRING }
                        },
                        required: ["num", "description", "qty", "expense"]
                      }
                    }
                  },
                  required: ["income", "accommodation", "feeDistribution", "sharingRatio", "picBonusRatio"]
                }
              },
              required: ["name", "date", "location", "rab", "realisasi"]
            }
          },
        },
      });

      const text = response.text || "[]";
      let parsed = [];
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        console.error("Failed to parse JSON reply from Gemini API:", text, parseErr);
        return res.status(500).json({ error: "Gagal memproses parsing data dari reply kecerdasan buatan" });
      }

      res.json({ success: true, projects: parsed });
    } catch (err: any) {
      console.error("Gemini Error:", err);
      res.status(500).json({ error: err?.message || "Internal Server Error in Gemini OCR Processing" });
    }
  });

  // API Route: parse-receipt (Upload Struk / Nota / Bukti Pengeluaran Realisasi Point B)
  app.post("/api/gemini/parse-receipt", async (req, res) => {
    try {
      const { imageBase64, mimeType = "image/jpeg" } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Data gambar struk (base64) tidak ditemukan" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: "GEMINI_API_KEY environment variable is not configured. Please add it in Settings > Secrets.",
        });
      }

      // Format image part for Gemini inline data
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      
      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: cleanBase64,
        },
      };

      const systemInstruction = `You are an expert AI financial auditor and receipt/expense parsing assistant for event production and project budgets (RAB & Realisasi).
Your task is to analyze images of payment receipts, cash receipts, nota belanja, struk bensin (Pertamina/Shell), struk konsumsi/makan/catering, nota toko listrik/bangunan/elektronik, tiket tol/parkir, bukti transfer bank, or vendor invoices.

From the provided receipt image, extract:
1. "description": A concise, clear, and professional description in Indonesian suitable for an expense report (e.g., "Bensin Pertamax (SPBU Pertamina)", "Makan Siang Crew 6 Porsi (RM Padang)", "Sewa Genset 5kVA & Kabel", "Pembelian Lakban Hitam & Baterai", "Biaya Tol & Parkir Lapangan").
2. "qty": Quantity of the primary item or transaction (default: 1 if it's a general lump-sum purchase).
3. "expense": Unit price or expense per unit in Indonesian Rupiah (IDR) as an integer without dots, decimals, or currency symbols.
4. "totalAmount": The grand total final amount on the receipt in IDR as an integer.
5. "merchant": The store/vendor name if visible (e.g. "SPBU Pertamina", "Indomaret", "RM Sederhana", "Warung Berkah").
6. "date": Date printed on receipt if visible (e.g. "12 November 2025" or "2025-11-12").
7. "items": If multiple line items are distinctly listed on the receipt, extract them with description, qty, expense (unit price), and total.

Be very careful to parse Indonesian numbers accurately (dots like 150.000 means 150000).`;

      const prompt = "Analisis struk/nota pengeluaran ini dan ekstrak deskripsi pengeluaran, jumlah qty, dan nominal harga totalnya.";

      const response = await generateContentWithFallback({
        contents: [imagePart, { text: prompt }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { 
                type: Type.STRING, 
                description: "Deskripsi pengeluaran dalam bahasa Indonesia yang ringkas dan jelas" 
              },
              qty: { 
                type: Type.INTEGER, 
                description: "Kuantitas barang/jasa (minimal 1)" 
              },
              expense: { 
                type: Type.INTEGER, 
                description: "Harga satuan pengeluaran dalam Rupiah integer" 
              },
              totalAmount: { 
                type: Type.INTEGER, 
                description: "Total nominal akhir pada struk dalam Rupiah integer" 
              },
              merchant: { 
                type: Type.STRING, 
                description: "Nama toko / merchant / vendor" 
              },
              date: { 
                type: Type.STRING, 
                description: "Tanggal pada struk" 
              },
              items: {
                type: Type.ARRAY,
                description: "Daftar item jika ada rincian belanja lebih dari satu",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    qty: { type: Type.INTEGER },
                    expense: { type: Type.INTEGER },
                    total: { type: Type.INTEGER }
                  },
                  required: ["description", "qty", "expense", "total"]
                }
              }
            },
            required: ["description", "qty", "expense", "totalAmount"]
          }
        }
      });

      const text = response.text || "{}";
      let parsedData: any = {};
      try {
        parsedData = JSON.parse(text);
      } catch (parseErr) {
        console.error("Failed to parse JSON reply from Gemini API:", text, parseErr);
        return res.status(500).json({ error: "Gagal memproses parsing data dari reply kecerdasan buatan" });
      }

      // Ensure valid numbers
      const finalQty = Number(parsedData.qty) > 0 ? Number(parsedData.qty) : 1;
      let finalExpense = Number(parsedData.expense) || 0;
      const finalTotal = Number(parsedData.totalAmount) || (finalQty * finalExpense);

      if (finalExpense === 0 && finalTotal > 0) {
        finalExpense = Math.round(finalTotal / finalQty);
      }

      res.json({
        success: true,
        data: {
          description: parsedData.description || "Pengeluaran Operasional Struk",
          qty: finalQty,
          expense: finalExpense,
          totalAmount: finalTotal,
          merchant: parsedData.merchant || "",
          date: parsedData.date || "",
          items: Array.isArray(parsedData.items) ? parsedData.items : []
        }
      });
    } catch (err: any) {
      console.error("Gemini Receipt OCR Error:", err);
      res.status(500).json({ error: err?.message || "Gagal memproses scan struk dengan AI" });
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
