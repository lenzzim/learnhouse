import { PaginaNota } from '@components/Caderno/Paginas'

/** /caderno/<id>: uma nota no editor. */
export default async function NotaPage(props: { params: Promise<{ nota: string }> }) {
  const { nota } = await props.params
  return <PaginaNota id={nota} />
}
