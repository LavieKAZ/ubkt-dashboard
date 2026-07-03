export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ hỗ trợ POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { meetingText, dashboardContext } = body;

    if (!meetingText || !String(meetingText).trim()) {
      return res.status(400).json({ error: 'Bạn chưa nhập nội dung họp giao ban.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel.'
      });
    }

    const input = `
Bạn là trợ lý AI phục vụ Dashboard UBKT.

Nhiệm vụ:
Từ nội dung họp giao ban và dữ liệu dashboard, hãy tổng hợp thành bản tóm tắt ngắn gọn, dễ dùng cho lãnh đạo.

Yêu cầu đầu ra:
1. Tóm tắt nhanh tình hình chính.
2. Các vấn đề nổi bật/cần chú ý.
3. Nhiệm vụ cần giao tiếp theo.
4. Rủi ro hoặc điểm nghẽn.
5. Đề xuất hành động ưu tiên trong tuần.

Văn phong:
- Tiếng Việt.
- Rõ ràng, hành chính, súc tích.
- Không bịa dữ liệu nếu nội dung không có.

Dữ liệu dashboard hiện có:
${dashboardContext || 'Chưa có dữ liệu dashboard bổ sung.'}

Nội dung họp giao ban:
${meetingText}
`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: 'gemini-3.5-flash',
          input,
          system_instruction:
            'Bạn là chuyên viên tổng hợp báo cáo cho dashboard quản lý dự án, nhiệm vụ, KPI, dư luận và giám sát cơ sở.',
          generation_config: {
            temperature: 0.3,
            thinking_level: 'low'
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Không gọi được Gemini API.'
      });
    }

    return res.status(200).json({
      summary: data.output_text || 'Gemini chưa trả về nội dung tổng hợp.'
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Lỗi máy chủ khi tổng hợp bằng AI.'
    });
  }
}
