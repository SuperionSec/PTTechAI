import { Route, Routes, useLocation } from 'react-router-dom'
import ProAppLayout from './layouts/ProAppLayout'
import { appRoutes } from './routes/routeConfig'
import RouteGuard from './routes/routeGuards'

function App() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  const routes = (
    <Routes>
      {appRoutes.map(route => (
        <Route key={route.path} path={route.path} element={<RouteGuard route={route} />} />
      ))}
    </Routes>
  )

  if (isLoginPage) {
    return routes
  }

  return <ProAppLayout>{routes}</ProAppLayout>
}

export default App
