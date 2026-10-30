// One page frame for every club-admin screen. The frame always matches the
// band above it (1080px), so the left edge never jumps between pages (1080px content + 24px padding each side); forms
// and reading lists keep a comfortable measure inside it, left-aligned.
// Padding sits outside the 1080px content box, exactly like MatchdayBand.
const FRAME = 'mx-auto w-full max-w-[1128px] px-4 py-10 pb-24 md:px-6 md:pb-10'

export const PAGE = FRAME
export const PAGE_READING = `${FRAME} [&>*]:max-w-[920px]`
export const PAGE_FORM = `${FRAME} [&>*]:max-w-[640px]`
