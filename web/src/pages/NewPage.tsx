import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, crearSolicitud } from '../api/client';
import { Reveal } from '../components/Reveal';
import { Doc } from '../components/icons';
import { Button, Card, CardHeader, controlClass, ErrorNote, Field } from '../components/ui';

export function NewPage() {
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEnviar = mensaje.trim().length > 0 && !enviando;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEnviando(true);

    // El `id` es opcional: si no se pasa, se genera uno legible y único.
    const idFinal = id.trim() || `MSG-${Date.now()}`;

    try {
      const { solicitud, creada } = await crearSolicitud({ id: idFinal, mensaje: mensaje.trim() });

      navigate(`/solicitud/${encodeURIComponent(solicitud.id)}`, {
        state: {
          aviso: creada
            ? 'Solicitud clasificada y guardada.'
            : 'La solicitud ya existía con el mismo contenido: se devolvió la clasificación previa (sin volver a llamar al modelo).',
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error inesperado');
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-8">
      <Reveal>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Entrada manual</p>
          <h1 className="mt-1 font-semibold text-4xl leading-none tracking-tight text-ink sm:text-5xl">
            Nueva solicitud
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Se envía el mensaje al clasificador y se persiste el resultado. El <span className="font-mono">id</span> es
            opcional (clave de idempotencia): si lo dejás vacío se genera <span className="font-mono">MSG-&lt;timestamp&gt;</span>.
            Reenviar el mismo id con el mismo texto devuelve la clasificación previa sin volver a llamar al modelo.
          </p>
        </div>
      </Reveal>

      <Reveal delay={60}>
        <Card className="max-w-3xl">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Doc size={17} />
                Mensaje interno
              </span>
            }
            hint="El texto se enmascara antes de salir hacia el modelo y nunca se guarda en logs."
          />

          <form className="space-y-5 px-6 py-6" onSubmit={onSubmit}>
            <Field label="id" hint="opcional · si lo dejás vacío se genera">
              <input
                className={`${controlClass} font-mono`}
                value={id}
                onChange={(event) => setId(event.target.value)}
                placeholder="MSG-1761234567890"
                autoComplete="off"
              />
            </Field>

            <Field label="Mensaje" hint={`${mensaje.length} caracteres`}>
              <textarea
                className={`${controlClass} min-h-40 resize-y leading-relaxed`}
                value={mensaje}
                onChange={(event) => setMensaje(event.target.value)}
                placeholder="Escribí o pegá el mensaje tal como llegó (español o portugués)."
              />
            </Field>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!puedeEnviar}>
                {enviando ? 'Clasificando…' : 'Clasificar y guardar'}
              </Button>
              <span className="text-xs text-muted">
                El id debe ser único; con contenido distinto responde 409.
              </span>
            </div>
          </form>
        </Card>
      </Reveal>
    </div>
  );
}
