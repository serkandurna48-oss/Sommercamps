export default function OrgNotFound() {
  return (
    <main className="min-h-screen bg-[#F0F2ED] px-6 py-16">
      <div className="mx-auto max-w-md">
        <p className="text-sm text-[#5B6158]">CampsPilot</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#14181A] [font-family:var(--font-pilot-display)]">
          Diese Organisation gibt es hier nicht
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[#5B6158]">
          Der Link, dem du gefolgt bist, verweist auf keine hinterlegte Organisation. Prüf den
          Link noch einmal, oder frag bei der Person nach, die ihn dir geschickt hat.
        </p>
      </div>
    </main>
  )
}
