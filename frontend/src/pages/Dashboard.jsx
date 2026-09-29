import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import DashboardAdmin from './dashboard/DashboardAdmin';
import DashboardTecnico from './dashboard/DashboardTecnico';

// Sprint 5 · Dashboard. El administrador ve los indicadores del año (HU19-HU21
// y cumplimiento del plan); el técnico, su trabajo de hoy y lo que viene.
export default function Dashboard() {
  const { esAdministrador } = useAuth();
  return <Layout titulo="Dashboard">{esAdministrador ? <DashboardAdmin /> : <DashboardTecnico />}</Layout>;
}
