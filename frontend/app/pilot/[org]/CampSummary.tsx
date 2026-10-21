import type { CampPublic } from '../../lib/saasApi'
import { formatCampDateRange, formatPrice } from '../../lib/parentFlowFormat'

export default function CampSummary({ camp }: { camp: CampPublic }) {
  return (
    <div className="pad camp-summary" aria-label="Camp auf einen Blick">
      <dl className="facts">
        <div className="r"><dt>Zeitraum</dt><dd>{formatCampDateRange(camp.start_date, camp.end_date)}</dd></div>
        <div className="r"><dt>Ort</dt><dd>{camp.location || 'Den Treffpunkt teilt Ihnen der Verein mit.'}</dd></div>
        <div className="r"><dt>Alter</dt><dd>{camp.age_min} bis {camp.age_max} Jahre</dd></div>
        <div className="r"><dt>Preis pro Kind</dt><dd>{formatPrice(camp.price_cents, camp.currency)}</dd></div>
        <div className="r"><dt>Plätze</dt><dd>{camp.is_full ? 'Warteliste — das Camp ist ausgebucht. Es entstehen noch keine Kosten.' : `${camp.spots_remaining} Plätze frei`}</dd></div>
      </dl>
    </div>
  )
}
