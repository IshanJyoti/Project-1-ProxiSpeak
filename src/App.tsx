import { useRef, useState } from 'react'
import {
  Activity, ArrowDownToLine, ArrowUpRight, Check, ChevronDown, CircleHelp,
  Copy, FileImage, ImagePlus, Layers3, MessageSquareText, MoreHorizontal,
  Palette, Plus, RotateCcw, Sparkles, UploadCloud, WandSparkles, X
} from 'lucide-react'

const styles = [
  { name: 'Anime comic', note: 'Expressive · detailed', icon: '✦' },
  { name: 'Graffiti ink', note: 'Bold · energetic', icon: '↗' },
  { name: 'Cyberpunk', note: 'Neon · futuristic', icon: '⌁' },
  { name: 'Editorial', note: 'Artistic · polished', icon: '◈' },
]

const defaultPrompt = `Create a high-quality 2D anime-comic digital portrait avatar. Show a stylish young adult character with expressive eyes, detailed tousled hair, clean black ink outlines, painterly cel shading, and subtle warm highlights. Add energetic graffiti-inspired ink splashes, hand-drawn stars, arrows, and abstract marks around the character. Use a white or transparent background with restrained electric-violet and amber accents. Frame the character from the chest up, centered, with crisp facial details and a confident, natural expression. Premium illustrated artwork, dynamic composition, fine linework, high resolution, suitable for an AI avatar profile. No text, no watermark, no photorealism, no 3D render.`

export default function App() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [style, setStyle] = useState('Anime comic')
  const [character, setCharacter] = useState('Young adult')
  const [expression, setExpression] = useState('Confident')
  const [palette, setPalette] = useState('Violet + amber')
  const [background, setBackground] = useState('White')
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState('')
  const inputRef = useRef(null)

  function handleFile(nextFile: File | null) {
    if (!nextFile) return
    if (!nextFile.type.startsWith('image/')) {
      setNotice('Please choose an image file such as PNG, JPG, or WEBP.')
      return
    }
    if (nextFile.size > 12 * 1024 * 1024) {
      setNotice('That image is over 12 MB. Choose a smaller file.')
      return
    }
    setNotice('')
    setFile(nextFile)
    setPreview(URL.createObjectURL(nextFile))
  }

  function buildPrompt() {
    const styleDescription = {
      'Anime comic': 'anime-comic digital illustration with detailed linework and expressive features',
      'Graffiti ink': 'street-art inspired 2D illustration with bold ink splashes, hand-drawn symbols, and sketchy energy',
      'Cyberpunk': 'futuristic 2D character illustration with neon accents, dramatic shadows, and cyberpunk details',
      'Editorial': 'premium editorial 2D character illustration with refined shapes, painterly shading, and artful composition',
    }[style]
    const text = `Create a high-quality ${styleDescription} avatar. Character: ${character}. Expression: ${expression.toLowerCase()}. Use crisp black outlines, detailed hair, expressive eyes, layered cel shading, and polished digital-painting textures. Color palette: ${palette}. Background: ${background.toLowerCase()}. Add tasteful graphic marks and abstract accents around the character, keeping the face as the focal point. Centered chest-up composition, clean silhouette, high resolution, suitable for a modern AI avatar platform. No text, no watermark, no photorealism, no 3D render.`
    setPrompt(text)
    setNotice('Prompt refreshed with your selected options.')
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setNotice('Copy was blocked by the browser. Select the prompt text and copy it manually.')
    }
  }

  function resetPrompt() {
    setPrompt(defaultPrompt)
    setNotice('Prompt reset to the ProxiSpeak default.')
  }

  function downloadImage() {
    if (!preview) return
    const a = document.createElement('a')
    a.href = preview
    a.download = file?.name || 'proxispeak-avatar'
    a.click()
  }

  return (
    <div className="min-h-screen bg-[#090b12] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-violet-700/10 blur-[120px]" />
        <div className="absolute -right-20 top-72 h-96 w-96 rounded-full bg-cyan-500/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-4 pb-10 sm:px-6 lg:px-10">
        <header className="flex h-[76px] items-center justify-between border-b border-white/[0.08]">
          <a href="#" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/20 bg-gradient-to-br from-violet-500 to-indigo-600 shadow-glow">
              <Activity size={21} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-[17px] font-semibold tracking-tight">ProxiSpeak<span className="text-violet-300">.</span></div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Creative AI workspace</div>
            </div>
          </a>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Workspace ready
          </div>
          <button className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08]">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-orange-300 to-violet-500 text-[10px] font-bold text-slate-950">P</div>
            <span className="hidden sm:inline">My workspace</span>
            <ChevronDown size={14} />
          </button>
        </header>

        <main>
          <section className="flex flex-col justify-between gap-5 py-8 md:flex-row md:items-end md:py-10">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.07] px-3 py-1.5 text-xs font-medium text-violet-200">
                <Sparkles size={13} /> AVATAR LAB <span className="text-violet-400/60">/</span> 01
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-[46px]">Build your <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-200 bg-clip-text text-transparent">digital identity.</span></h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Upload an avatar or craft a detailed AI prompt for expressive, anime-comic character art. Your creative workflow starts here.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500"><Layers3 size={15} /> 2D Avatar Studio <span className="text-slate-700">·</span> v1.0</div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="icon-tile"><ImagePlus size={18} /></div>
                  <div><h2 className="font-semibold">Avatar upload</h2><p className="mt-0.5 text-xs text-slate-500">Bring your character into the workspace</p></div>
                </div>
                <button aria-label="More upload options" className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"><MoreHorizontal size={19} /></button>
              </div>

              <div className="p-5 sm:p-6">
                <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                <div
                  className={`upload-zone group relative flex min-h-[320px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed ${preview ? 'border-violet-400/30' : 'border-white/15 hover:border-violet-300/50'} bg-[#0b0e17] text-center transition`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-active') }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('drag-active')}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-active'); handleFile(e.dataTransfer.files?.[0]) }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
                >
                  {preview ? (
                    <>
                      <img src={preview} alt="Uploaded avatar preview" className="absolute inset-0 h-full w-full object-contain p-4" />
                      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl border border-white/10 bg-[#090b12]/85 p-3 text-left backdrop-blur">
                        <div className="flex min-w-0 items-center gap-2"><FileImage size={17} className="shrink-0 text-violet-300" /><div className="min-w-0"><p className="truncate text-xs font-medium">{file?.name}</p><p className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB · Image preview</p></div></div>
                        <span className="ml-2 rounded-lg bg-white/10 p-2 text-xs text-slate-200">Replace</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-500/15 to-cyan-400/10 text-violet-200 shadow-glow transition group-hover:scale-105"><UploadCloud size={27} /></div>
                      <h3 className="text-base font-medium">Drop your avatar here</h3>
                      <p className="mt-2 text-sm text-slate-500">or <span className="text-violet-300 underline underline-offset-4">browse files</span> from your device</p>
                      <div className="mt-6 flex flex-wrap justify-center gap-2"><span className="file-pill">PNG</span><span className="file-pill">JPG</span><span className="file-pill">WEBP</span><span className="file-pill">Max 12 MB</span></div>
                      <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full border border-white/[0.04]" />
                      <div className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full border border-violet-400/[0.08]" />
                    </>
                  )}
                </div>

                {notice && <div className="mt-3 rounded-xl border border-violet-300/15 bg-violet-300/[0.06] px-3 py-2 text-xs text-violet-100">{notice}</div>}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button onClick={() => inputRef.current?.click()} className="primary-button"><Plus size={16} /> {preview ? 'Replace avatar' : 'Upload avatar'}</button>
                  <button onClick={downloadImage} disabled={!preview} className="secondary-button disabled:cursor-not-allowed disabled:opacity-40"><ArrowDownToLine size={16} /> Download image</button>
                </div>

                <div className="mt-5 flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
                  <CircleHelp size={17} className="mt-0.5 shrink-0 text-slate-500" />
                  <p className="text-xs leading-5 text-slate-500">Your image preview stays in this browser session. This demo does not upload files to a server or generate an AI image automatically.</p>
                </div>
              </div>
            </section>

            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="icon-tile"><WandSparkles size={18} /></div>
                  <div><h2 className="font-semibold">AI prompt studio</h2><p className="mt-0.5 text-xs text-slate-500">Design your avatar's visual direction</p></div>
                </div>
                <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-200">Prompt ready</span>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div>
                  <div className="mb-3 flex items-center justify-between"><label className="text-sm font-medium text-slate-200">Illustration style</label><span className="text-[11px] text-slate-500">Choose a look</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    {styles.map((item) => <button key={item.name} onClick={() => setStyle(item.name)} className={`style-card ${style === item.name ? 'style-card-active' : ''}`}><span className={`style-symbol ${style === item.name ? 'text-violet-200' : 'text-slate-500'}`}>{item.icon}</span><span className="min-w-0 text-left"><span className="block text-xs font-medium text-slate-200">{item.name}</span><span className="mt-1 block text-[10px] text-slate-500">{item.note}</span></span>{style === item.name && <Check size={14} className="ml-auto text-violet-200" />}</button>)}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="field-label">Character</label><select className="field" value={character} onChange={(e) => setCharacter(e.target.value)}><option>Young adult</option><option>Teen character</option><option>Mature adult</option><option>Fantasy character</option><option>AI assistant persona</option></select></div>
                  <div><label className="field-label">Expression</label><select className="field" value={expression} onChange={(e) => setExpression(e.target.value)}><option>Confident</option><option>Friendly</option><option>Thoughtful</option><option>Playful</option><option>Serious</option><option>Calm</option></select></div>
                  <div><label className="field-label">Color palette</label><select className="field" value={palette} onChange={(e) => setPalette(e.target.value)}><option>Violet + amber</option><option>Electric blue + cyan</option><option>Monochrome black + white</option><option>Pastel pink + lavender</option><option>Neon cyberpunk</option><option>Warm earth tones</option></select></div>
                  <div><label className="field-label">Background</label><select className="field" value={background} onChange={(e) => setBackground(e.target.value)}><option>White</option><option>Transparent</option><option>Soft gradient</option><option>Dark futuristic</option><option>Graffiti texture</option></select></div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between"><label className="text-sm font-medium text-slate-200">Generated prompt</label><button onClick={resetPrompt} className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-200"><RotateCcw size={12} /> Reset</button></div>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} className="prompt-area" spellCheck="false" aria-label="AI avatar prompt" />
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500"><span>{prompt.length} characters</span><span className="inline-flex items-center gap-1"><MessageSquareText size={12} /> Works with ChatGPT image generation</span></div>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <button onClick={buildPrompt} className="primary-button"><Sparkles size={16} /> Generate prompt</button>
                  <button onClick={copyPrompt} className="secondary-button min-w-[112px]">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied!' : 'Copy prompt'}</button>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-violet-300/15 bg-gradient-to-r from-violet-400/[0.07] to-cyan-400/[0.04] p-3.5">
                  <div className="rounded-lg bg-violet-300/10 p-2 text-violet-200"><WandSparkles size={16} /></div>
                  <div className="flex-1"><p className="text-xs font-medium text-slate-200">Ready for image generation?</p><p className="mt-1 text-xs leading-5 text-slate-500">Copy the prompt and paste it into ChatGPT. Generate your 2D avatar there, then upload the resulting image in the panel to the left.</p></div>
                  <ArrowUpRight size={15} className="mt-1 shrink-0 text-slate-500" />
                </div>
              </div>
            </section>
          </div>

          <section className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="stat-card"><div className="flex items-center gap-2 text-xs text-slate-500"><ImagePlus size={14} /> Avatar workspace</div><p className="mt-3 text-lg font-semibold">{preview ? '1 image loaded' : 'Ready to upload'}</p><p className="mt-1 text-xs text-slate-600">{preview ? 'Preview available in this session' : 'PNG, JPG or WEBP · 12 MB max'}</p></div>
            <div className="stat-card"><div className="flex items-center gap-2 text-xs text-slate-500"><Palette size={14} /> Current style</div><p className="mt-3 text-lg font-semibold">{style}</p><p className="mt-1 text-xs text-slate-600">Customize and regenerate your prompt</p></div>
            <div className="stat-card"><div className="flex items-center gap-2 text-xs text-slate-500"><Sparkles size={14} /> AI prompt status</div><p className="mt-3 text-lg font-semibold">Editable prompt</p><p className="mt-1 text-xs text-slate-600">Copy it to your preferred image generator</p></div>
          </section>
          <footer className="flex flex-col gap-2 py-8 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 ProxiSpeak · Avatar Lab</span><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" /> Frontend demo · No backend connected</span></footer>
        </main>
      </div>
    </div>
  )
}