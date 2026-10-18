import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DetailPage } from './pages/DetailPage';
import { ListPage } from './pages/ListPage';
import { NewPage } from './pages/NewPage';

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-semibold text-3xl tracking-tight text-ink">Página no encontrada</p>
      <p className="mt-2 text-sm text-muted">La ruta que buscás no existe.</p>
      <Link to="/" className="mt-6 inline-block text-sm text-ink underline underline-offset-4">
        Volver a solicitudes
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ListPage />} />
        <Route path="/nueva" element={<NewPage />} />
        <Route path="/solicitud/:id" element={<DetailPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
