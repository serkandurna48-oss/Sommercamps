// One page frame for every club-admin screen. The frame always matches the
// band above it (1080px), so the left edge never jumps between pages; forms
// and reading lists keep a comfortable measure inside it, left-aligned.
const FRAME = 'mx-auto w-full max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6'

export const PAGE = FRAME
export const PAGE_READING = `${FRAME} [&>*]:max-w-[920px]`
export const PAGE_FORM = `${FRAME} [&>*]:max-w-[640px]`
