import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Activities from './pages/Activities'
import ActivityDetail from './pages/ActivityDetail'
import About from './pages/About'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/activities/:id" element={<ActivityDetail />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </Layout>
  )
}
