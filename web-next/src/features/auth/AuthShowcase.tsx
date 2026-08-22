import { BrandMark } from '../../components/brand/BrandMark';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';

// Mini-vista del Panel real de NUVA (mismos textos/cifras de estilo que Dashboard),
// puesta dentro de un marco de celular — no una captura de pantalla, sino los mismos
// componentes en miniatura, para que quede fiel si el diseño del Panel cambia.
function PhoneScreen() {
  return (
    <div className="flex h-full flex-col gap-3 bg-[#0d0d0f] p-4 pt-8 text-white">
      <div className="flex items-center justify-between">
        <BrandMark className="h-4 w-4 text-white" />
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#ffb020] to-[#ff6259]" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-3.5">
        <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Lo que tengo</p>
        <p className="num mt-1 text-[26px] font-extrabold leading-none tracking-tight">
          <AnimatedDigits value="S/ 12,910.50" />
        </p>
        <span className="num mt-2 inline-flex items-center gap-1 rounded-full bg-[#2fa86b]/20 px-2 py-0.5 text-[9px] font-bold text-[#4ade9a]">
          <i className="ph ph-trend-up" aria-hidden="true" /> +S/ 2,480 este mes
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
          <p className="text-[8px] font-bold uppercase tracking-wide text-white/40">Disponible</p>
          <p className="num mt-0.5 text-sm font-extrabold text-[#4ade9a]">S/ 8,240</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
          <p className="text-[8px] font-bold uppercase tracking-wide text-white/40">Ahorro</p>
          <p className="num mt-0.5 text-sm font-extrabold">32%</p>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-[9px] font-bold text-white/60">Actividad reciente</p>
        <div className="flex flex-col gap-2.5">
          {[
            { icon: 'ph-hamburger', name: 'Almuerzo', amt: '-S/ 24.50', color: '#e2836b' },
            { icon: 'ph-credit-card', name: 'Sueldo', amt: '+S/ 3,200', color: '#4ade9a' },
            { icon: 'ph-car', name: 'Taxi', amt: '-S/ 18.00', color: '#a9adc4' },
          ].map((row) => (
            <div key={row.name} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06]" style={{ color: row.color }}>
                <i className={`ph ${row.icon} text-[11px]`} aria-hidden="true" />
              </span>
              <span className="flex-1 truncate text-[10px] font-semibold">{row.name}</span>
              <span className="num text-[10px] font-bold" style={{ color: row.amt.startsWith('+') ? '#4ade9a' : '#fff' }}>
                {row.amt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Panel izquierdo tipo "split screen" (referencia: rediseño de Payoneer en Dribbble),
// adaptado a la marca real de NUVA: rojo sólido, riel/topbar del mismo negro que usa
// el resto de la app, y un mockup de celular con los mismos componentes del Panel en
// miniatura en vez de una captura estática.
export function AuthShowcase() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-[var(--sidebar-bg)] p-10 text-white lg:flex lg:p-14">
      <div
        className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full opacity-25 blur-[100px]"
        style={{ background: 'radial-gradient(circle, #ff6259, transparent 70%)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full opacity-15 blur-[100px]"
        style={{ background: 'radial-gradient(circle, #dc2626, transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="relative flex items-center gap-2.5">
        <BrandMark className="h-7 w-7 text-white" />
        <span className="text-lg font-extrabold tracking-tight">NUVA</span>
      </div>

      <div className="relative flex flex-1 items-center gap-10 xl:gap-16">
        <div className="max-w-xs shrink-0">
          <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-tight xl:text-5xl">
            Todo tu dinero,
            <br />
            un solo panel.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/60">
            Cuentas, tarjetas, metas de ahorro y pagos por vencer — sin hojas de cálculo, sin sorpresas a fin de mes.
          </p>
        </div>

        {/* El celular necesita ~220px + el titular ~320px + gap — no entra en la mitad
            de la pantalla a 1024px (lg), recién a partir de 1280px (xl) sobra espacio.
            Entre lg y xl el panel se queda solo con el titular, no con el celular a medias. */}
        <div className="relative mx-auto hidden shrink-0 xl:block">
          <div className="h-[440px] w-[220px] rounded-[2.25rem] border-[6px] border-[#1c1c1f] bg-[#1c1c1f] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)]">
            <div className="relative h-full w-full overflow-hidden rounded-[1.75rem]">
              <div className="absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-xl bg-[#1c1c1f]" aria-hidden="true" />
              <PhoneScreen />
            </div>
          </div>
        </div>
      </div>

      <p className="relative text-xs text-white/35">© {new Date().getFullYear()} NUVA — hecho para tus finanzas en soles.</p>
    </div>
  );
}
