import type { GeneratedReportDocument } from '../../src/public/contracts'
import { renderPublicationReportHtml } from './reportPublicationHtml'

export function renderReportHtml(report: GeneratedReportDocument): string {
  return renderPublicationReportHtml(report)
}
