import { useEffect, useState } from 'react'
import { todayLocal } from '../utils/dateUtils'

/** Tanggal lokal hari ini; diperbarui otomatis saat lewat tengah malam. */
export default function useToday() {
  const [today, setToday] = useState(() => todayLocal())
  useEffect(() => {
    const id = setInterval(() => setToday((prev) => {
      const now = todayLocal()
      return now === prev ? prev : now
    }), 60000)
    return () => clearInterval(id)
  }, [])
  return today
}
