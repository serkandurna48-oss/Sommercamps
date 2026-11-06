// Page frames.
//
// Club admin (Launch-UX): the content column next to the sidebar uses up to
// 1440px with the same side padding as PageHeader, so the left edge never
// jumps between pages. Reading lists keep a comfortable measure; forms get
// room for two columns from 1024px (see .cp-form-grid in tokens.css).
const ADMIN_FRAME = 'mx-auto w-full max-w-[1440px] px-4 pt-5 pb-16 md:px-8 md:pt-6'

export const ADMIN_PAGE = ADMIN_FRAME
export const PAGE_READING = `${ADMIN_FRAME} [&>*]:max-w-[1040px]`
export const PAGE_FORM = `${ADMIN_FRAME} [&>*]:max-w-[1120px]`

// Platform console keeps its own band and 1080px frame.
export const PAGE = 'mx-auto w-full max-w-[1128px] px-4 py-10 pb-24 md:px-6 md:pb-10'
