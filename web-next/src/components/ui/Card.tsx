import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'dark' | 'hero' | 'bare';
}

// En la app real (.card / .hero-card en styles.css) todas las tarjetas comparten el
// mismo tratamiento visual — radio, borde, sombra — el hero no tiene fondo ni glow
// propio, se destaca solo por el tamaño del número que contiene, no por la tarjeta.
// "bare" (Inicio mobile, línea "sin tarjetas" del boceto blanco): mismo contenido,
// sin borde/fondo/sombra — el padding lateral lo pone el layout, no la tarjeta.
const BASE = 'rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_48px_-20px_rgba(10,10,10,.16),0_4px_14px_rgba(10,10,10,.05)]';
const VARIANT_CLASSES: Record<NonNullable<CardProps['variant']>, string> = {
  default: `${BASE} p-[22px]`,
  dark: `${BASE} p-[22px] bg-[var(--surface-raised)]`,
  hero: `${BASE} p-8`,
  bare: 'py-5',
};

export function Card({ variant = 'default', className = '', children, ...rest }: CardProps) {
  return (
    <div className={`${VARIANT_CLASSES[variant]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
