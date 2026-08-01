/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta "Volt": base carbón + acento lima eléctrico.
        carbon: {
          950: '#0A0C10',
          900: '#0F1115', // fondo
          800: '#161920', // superficie
          700: '#1C2028', // tarjetas
          600: '#262B36', // bordes / superficies elevadas
          500: '#39404E',
        },
        volt: {
          400: '#D8FF7A',
          500: '#C8F751', // acento principal
          600: '#A8D62F',
        },
        aqua: {
          400: '#7BEDED',
          500: '#4CE0E0', // acento secundario (spinning)
          600: '#2BB8B8',
        },
        humo: {
          100: '#EDEFF3',
          300: '#B7BDC9',
          500: '#8A93A3', // texto secundario
        },
        alerta: '#FF6B57',
        // Semáforo del salón: verde = puesto libre, rojo = puesto tomado. Es la
        // convención que ya entiende cualquiera y no depende de la disciplina,
        // así que no se mezcla con los acentos (lima/aqua) de la paleta.
        puesto: {
          libre: '#33D67F',
          ocupado: '#FF5A4C',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        volt: '0 0 0 1px rgba(200,247,81,0.35), 0 8px 24px -8px rgba(200,247,81,0.45)',
        alzado: '0 12px 32px -12px rgba(0,0,0,0.8)',
      },
      keyframes: {
        aparecer: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        subirHoja: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        latido: {
          '0%,100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
        },
        surgir: {
          '0%': { opacity: '0', transform: 'scale(.92) translateY(12px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        aparecer: 'aparecer .28s cubic-bezier(.16,1,.3,1) both',
        subirHoja: 'subirHoja .32s cubic-bezier(.16,1,.3,1) both',
        latido: 'latido .4s ease-in-out',
        surgir: 'surgir .3s cubic-bezier(.16,1,.3,1) both',
      },
    },
  },
  plugins: [],
};
