import './globals.css'

export const metadata = {
  title: 'UBKT Phường Tân Mỹ — Hệ thống giám sát dữ liệu',
  description: 'Ủy ban Kiểm tra Đảng ủy phường Tân Mỹ',
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
