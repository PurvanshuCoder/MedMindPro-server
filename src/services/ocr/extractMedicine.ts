import path from 'path'
import { runOCR } from './ocrProvider'
import { parseExtractedMedicineText, type ExtractedMedicine } from '../../utils/parseExtractedText'
import { enrichMedicineWithLLM } from '../ai/medicineEnrichment'

export async function extractMedicineFromImage(filePath: string): Promise<{
  extracted: ExtractedMedicine
  ocrText: string
  provider: string
  profileMarkdown: string
}> {
  const fileExt = path.extname(filePath).toLowerCase()
  if (!fileExt) {
    // eslint-disable-next-line no-console
    console.warn('Extracting medicine without file extension')
  }

  const ocrText = await runOCR(filePath)
  const parsed = parseExtractedMedicineText(ocrText)
  const { enriched, provider, profileMarkdown } = await enrichMedicineWithLLM(ocrText, parsed)
  return { extracted: enriched, ocrText, provider, profileMarkdown }
}

