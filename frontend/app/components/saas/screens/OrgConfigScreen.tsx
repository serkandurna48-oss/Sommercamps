import OrganizationConfigForm from '../config/OrganizationConfigForm'
import PageHeader from '../shell/PageHeader'
import { de } from '../../../lib/i18n/de'
import type { OrganizationIdentityProps } from './types'
import { PAGE_FORM } from '../ui/pageLayout'

export default function OrgConfigScreen({ orgSlug, org }: OrganizationIdentityProps) {

  return (
    <>
      <PageHeader
        title="Vereinseinstellungen"
        subtitle={de.configPage.orgHint}
      />

      <main className={PAGE_FORM}>
        <h2 className="sr-only">{de.configPage.orgHeading}</h2>

        <OrganizationConfigForm orgSlug={orgSlug} org={org} />
      </main>
    </>
  )
}
