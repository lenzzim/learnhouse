import { redirect } from 'next/navigation'

/** "Bate-papos" virou "Agenda": links antigos continuam funcionando. */
export default function BatePaposPage() {
  redirect('/agenda')
}
