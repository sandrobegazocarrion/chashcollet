import { BrandMark } from '../../components/brand/BrandMark';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';

// Mini-vista del Panel real de NUVA (mismos textos/cifras de estilo que Dashboard),
// puesta dentro de un marco de celular — no una captura de pantalla, sino los mismos
// componentes en miniatura, para que quede fiel si el diseño del Panel cambia.
function PhoneScreen() {
  return (
    <div className="flex h-full flex-col gap-3 bg-[#060b1f] p-4 pt-8 text-white">
      <div className="flex items-center justify-between">
        <BrandMark className="h-4 w-4 text-white" />
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#614cd1] text-[10px] font-bold">D</div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-3.5">
        <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Lo que tengo</p>
        <p className="num mt-1 text-[26px] font-extrabold leading-none tracking-tight">
          <AnimatedDigits value="S/ 12,910.50" />
        </p>
        <span className="num mt-2 inline-flex items-center gap-1 rounded-full bg-[#34d399]/20 px-2 py-0.5 text-[9px] font-bold text-[#34d399]">
          <i className="ph ph-trend-up" aria-hidden="true" /> +S/ 2,480 este mes
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
          <p className="text-[8px] font-bold uppercase tracking-wide text-white/40">Disponible</p>
          <p className="num mt-0.5 text-sm font-extrabold text-[#34d399]">S/ 8,240</p>
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
            { icon: 'ph-credit-card', name: 'Sueldo', amt: '+S/ 3,200', color: '#34d399' },
            { icon: 'ph-car', name: 'Taxi', amt: '-S/ 18.00', color: '#a9adc4' },
          ].map((row) => (
            <div key={row.name} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06]" style={{ color: row.color }}>
                <i className={`ph ${row.icon} text-[11px]`} aria-hidden="true" />
              </span>
              <span className="flex-1 truncate text-[10px] font-semibold">{row.name}</span>
              <span className="num text-[10px] font-bold" style={{ color: row.amt.startsWith('+') ? '#34d399' : '#fff' }}>
                {row.amt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Panel izquierdo tipo "split screen", con la identidad real de NUVA: navy sólido,
// el trazo del logo como marca de agua discreta (no un blob de degradado), y un
// mockup de celular con los mismos componentes del Panel en miniatura en vez de
// una captura estática o un mockup de stock.
export function AuthShowcase() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-[var(--sidebar-bg)] p-10 text-white lg:flex lg:p-14">
      <svg
        className="pointer-events-none absolute -bottom-16 -right-24 h-[520px] w-[520px] text-white opacity-[0.04]"
        viewBox="0 0 136.03 120.25"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M17.45,81.94c-1.55,4.69-6.61,7.24-11.3,5.7-4.69-1.55-7.24-6.61-5.7-11.3,4.08-12.36,8.15-24.71,12.23-37.07,3.62-5.5,10.03-8.51,16.57-7.76,6.55.74,12.12,5.11,14.41,11.28-.91-2.99-3.66-5.04-6.78-5.06-3.13-.02-5.9,1.99-6.86,4.97-4.19,13.08-8.38,26.17-12.57,39.25Z" />
        <path d="M54.82,35.24c-4.36-8.22-13.24-13-22.5-12.12-9.26.88-17.07,7.26-19.8,16.15,3.62-5.5,10.03-8.51,16.57-7.76,6.55.74,12.12,5.11,14.41,11.28,7.17,10.74,14.33,21.47,21.5,32.21,5.42,8.54,15,13.53,25.1,13.05,10.03-.47,19.29-6.13,23.75-15.28,6.58-13.17,13.17-26.33,19.75-39.5,5.68-11.36,1.08-25.17-10.28-30.85-11.36-5.68-25.17-1.08-30.85,10.28-5.42,10.85-10.85,21.7-16.27,32.55-1.93,3.55-.53,7.99,3.08,9.8s8.01.26,9.69-3.41l16.06-32.12c2.21-4.42,7.59-6.21,12.01-4,4.42,2.21,6.21,7.59,4,12.01-6.31,12.63-12.63,25.26-18.94,37.89-2.34,4.69-6.99,7.79-12.22,8.14-5.23.36-10.26-2.08-13.22-6.41-7.28-10.64-14.56-21.28-21.84-31.92Z" />
      </svg>

      <div className="relative flex items-center gap-2.5">
        <BrandMark className="h-7 w-7 text-white" />
        <span className="text-lg font-extrabold tracking-tight">NUVA</span>
      </div>

      <div className="relative flex flex-1 items-center gap-10 xl:gap-16">
        <div className="max-w-xs shrink-0">
          {/* Chas, la mascota de NUVA — llena justo el hueco que quedaba entre lg y
              xl cuando el celular todavía no cabe (ver nota más abajo). */}
          <img src="/mascot/bienvenido.webp" alt="" aria-hidden="true" className="mb-5 h-24 w-24 object-contain" width={96} height={96} />
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
