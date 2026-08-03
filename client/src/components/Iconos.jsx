/** Iconos SVG en línea: sin dependencias externas y heredan el color del texto. */
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function IconoRunning({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="15.5" cy="4.5" r="1.8" />
      <path d="M13.6 8.2 10 10.5l1.8 3.3-1.4 5.6" />
      <path d="m13.6 8.2 3.2 1.6.9 3.1 2.3.7" />
      <path d="m11.8 13.8 3.4 1.4 1.1 4.2" />
      <path d="M9.6 10.7 6.4 12l-1.5 2.6" />
      <path d="M3.2 8.6h3.4M2 12h2.6" />
    </svg>
  );
}

export function IconoSpinning({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="5.2" cy="17.4" r="3.4" />
      <circle cx="18.8" cy="17.4" r="3.4" />
      <path d="M5.2 17.4 9 9.6h5.2l3 7.8" />
      <path d="M9 9.6h6.4M12.6 9.6 11 17.4" />
      <path d="M14.2 6.2h3" />
    </svg>
  );
}

export const ICONOS_DISCIPLINA = { run: IconoRunning, bike: IconoSpinning };

export function IconoFlecha({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconoAtras({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function IconoCheck({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function IconoCalendario({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3.2" y="5" width="17.6" height="16" rx="3" />
      <path d="M3.2 10h17.6M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconoReloj({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3 1.8" />
    </svg>
  );
}

export function IconoUsuario({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="8.4" r="3.6" />
      <path d="M4.8 20c.9-3.6 3.8-5.4 7.2-5.4s6.3 1.8 7.2 5.4" />
    </svg>
  );
}

export function IconoCandado({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="4.6" y="10.4" width="14.8" height="10" rx="3" />
      <path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
    </svg>
  );
}

export function IconoRayo({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M13.4 2.6 4.8 13.4h6L10.6 21.4l8.6-10.8h-6z" />
    </svg>
  );
}

export function IconoAlerta({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 4.2 2.6 20h18.8z" />
      <path d="M12 10v4M12 17.2h.01" />
    </svg>
  );
}

export function IconoDescargar({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 3.6v11M7.6 10.2 12 14.6l4.4-4.4" />
      <path d="M4.4 18.4v1.2a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-1.2" />
    </svg>
  );
}

export function IconoBuscar({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="m15.6 15.6 4.4 4.4" />
    </svg>
  );
}

export function IconoMas({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Cuatro esquinas hacia afuera: entrar a pantalla completa. */
export function IconoExpandir({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M9 4H4v5M20 9V4h-5M15 20h5v-5M4 15v5h5" />
    </svg>
  );
}

/** Las mismas esquinas hacia adentro: salir. */
export function IconoContraer({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5" />
    </svg>
  );
}

export function IconoCerrar({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function IconoPanel({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3.2" y="3.6" width="7.2" height="7.2" rx="2" />
      <rect x="13.6" y="3.6" width="7.2" height="7.2" rx="2" />
      <rect x="3.2" y="13.2" width="7.2" height="7.2" rx="2" />
      <rect x="13.6" y="13.2" width="7.2" height="7.2" rx="2" />
    </svg>
  );
}

export function IconoDinero({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="2.6" y="6" width="18.8" height="12" rx="3" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

export function IconoMusica({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M9 17.4V5.6l10-2v11.8" />
      <circle cx="6.6" cy="17.4" r="2.6" />
      <circle cx="16.6" cy="15.4" r="2.6" />
    </svg>
  );
}
