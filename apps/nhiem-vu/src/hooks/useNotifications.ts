import * as React from 'react'
import { supabase } from '@/lib/supabase'

export interface Notice {
  id: string
  category: string
  title: string
  body: string | null
  action_page: string | null
  read_at: string | null
  created_at: string
}

/** Thông báo trong ứng dụng (chuông). Có thông báo mới là hiện ngay, không cần tải lại trang. */
export function useNotifications(userId: string | undefined) {
  const [items, setItems] = React.useState<Notice[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!userId) return
    let alive = true
    supabase
      .from('system_notifications')
      .select('id, category, title, body, action_page, read_at, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!alive) return
        setItems((data as Notice[]) ?? [])
        setLoading(false)
      })

    const channel = supabase
      .channel(`notices-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as Notice, ...prev].slice(0, 30)),
      )
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [userId])

  const unread = items.filter((n) => !n.read_at).length

  const markAllRead = React.useCallback(async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id)
    if (!ids.length) return
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    await supabase.from('system_notifications').update({ read_at: now }).in('id', ids)
  }, [items])

  const markRead = React.useCallback(async (id: string) => {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)))
    await supabase.from('system_notifications').update({ read_at: now }).eq('id', id).is('read_at', null)
  }, [])

  return { items, unread, loading, markAllRead, markRead }
}
