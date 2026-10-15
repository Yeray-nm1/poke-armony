import { Workspace } from "@/components/workspace"
import { getDatasetStatus, slimDataset, type DataStatus } from "@/lib/data"

// La página depende por completo del dataset (meta vivo + base), así que no
// puede ofrecer un App Shell instantáneo: permitimos que bloquee. No la hace
// dinámica (en producción sigue prerenderizándose), solo silencia el insight.
export const instant = false

function MissingData() {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="font-display text-2xl font-semibold">No se pudieron cargar los datos</h1>
      <p className="mt-3 text-muted">
        Las fuentes vivas (Showdown y Limitless) no respondieron al ingerir el meta. Recarga la
        página en un momento.
      </p>
    </main>
  )
}

export default async function Home() {
  let payload: { dataset: ReturnType<typeof slimDataset>; status: DataStatus } | null = null
  try {
    const { dataset, status } = await getDatasetStatus()
    payload = { dataset: slimDataset(dataset), status }
  } catch {
    payload = null
  }
  if (!payload) return <MissingData />
  return <Workspace dataset={payload.dataset} status={payload.status} />
}
