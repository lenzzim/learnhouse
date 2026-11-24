import { redirect } from 'next/navigation'

type Props = { params: Promise<{ eventuuid: string }> }

/** Links antigos /batepapos/<id> (posts de divulgação, notificações) -> /agenda/<id>. */
export default async function BatePapoPage(props: Props) {
  const { eventuuid } = await props.params
  redirect(`/agenda/${encodeURIComponent(eventuuid)}`)
}
