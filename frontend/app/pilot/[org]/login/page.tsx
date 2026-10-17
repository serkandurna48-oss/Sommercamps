import LoginForm from './LoginForm'

export default async function AdminLoginPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  return <LoginForm orgSlug={org} />
}
