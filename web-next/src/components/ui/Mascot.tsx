import { motion, useReducedMotion } from 'framer-motion';

interface MascotProps {
  pose: string;
  size?: number;
  className?: string;
  /** Retraso de la entrada, para escalonarla con el resto del layout (ver MotionCard). */
  delay?: number;
}

const ENTER_EASE = [0.16, 1, 0.3, 1] as const;

// Chas, la mascota de NUVA — entra con un salto sutil (no un simple fade) y después
// queda flotando suave en bucle, como si respirara. Es una ilustración estática
// (WebP, /public/mascot/<pose>.webp), así que el "movimiento de la pose" viene 100%
// de esta envoltura, no de la imagen — nunca mueve partes del personaje.
export function Mascot({ pose, size = 96, className = '', delay = 0 }: MascotProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.img
      src={`/mascot/${pose}.webp`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.85 }}
      animate={
        reduceMotion
          ? { opacity: 1 }
          : {
              opacity: 1,
              y: [16, -6, 0, -4, 0],
              scale: [0.85, 1.04, 1, 1.02, 1],
            }
      }
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : {
              duration: 0.9,
              delay,
              ease: ENTER_EASE,
              times: [0, 0.55, 0.75, 0.9, 1],
            }
      }
    />
  );
}

// Variante con flotación continua después de la entrada — para spots donde Chas
// vive solo (login, estado vacío grande), no para usos chicos/repetidos donde el
// loop constante sería ruido visual.
export function FloatingMascot({ pose, size = 96, className = '', delay = 0 }: MascotProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <Mascot pose={pose} size={size} className={className} delay={delay} />;

  return (
    <motion.div
      className={className}
      style={{ width: size, height: size }}
      initial={{ opacity: 0, y: 16, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay, ease: ENTER_EASE }}
    >
      <motion.img
        src={`/mascot/${pose}.webp`}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className="object-contain"
        style={{ width: size, height: size }}
        animate={{ y: [0, -7, 0], rotate: [0, -2, 0, 2, 0] }}
        transition={{ duration: 4.5, delay: delay + 0.6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}
