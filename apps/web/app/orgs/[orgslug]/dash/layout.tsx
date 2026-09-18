import { Metadata } from 'next'
import React from 'react'
import ClientAdminLayout from './ClientAdminLayout'
import PainelTemaClaro from '@components/Utils/PainelTemaClaro'

export const metadata: Metadata = {
  title: 'LearnHouse Dashboard',
}

async function DashboardLayout(
  props: {
    children: React.ReactNode
    params: Promise<any>
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  return (
    <>
      {/* O painel é claro: a sobreposição escura não cobre as telas de
          configuração e deixaria texto claro sobre fundo claro. */}
      <PainelTemaClaro />
      <ClientAdminLayout
        params={params}>
        {children}
      </ClientAdminLayout>
    </>
  )
}

export default DashboardLayout
