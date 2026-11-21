import { PaginaTcd } from '@components/Caderno/Paginas'

/** /caderno/tcd/<YYYY-MM-DD>: o TCD do dia (abre ou cria). */
export default async function TcdPage(props: { params: Promise<{ data: string }> }) {
  const { data } = await props.params
  return <PaginaTcd data={data} />
}
