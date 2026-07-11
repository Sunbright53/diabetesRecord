1. First-boot indicator — ตอน user เพิ่งเสียบไฟใหม่ ใน 2-3 นาทีแรก readings จะ drift เยอะ
  ควรมีเตือนในแอปว่า "เพิ่งเปิดเครื่อง รอ 2 นาทีก่อนตรวจ"
  2. Quality score gate — ถ้า quality < 60 หลัง session จบ ควรเตือนว่า "ค่าไม่แม่นยำ ลองเป่าใหม่"
  (โค้ดมี quality_score อยู่แล้ว แต่ยังไม่ได้ enforce)
  3. Sample rate ตอน recording — ESP32 ส่งทุก 3 วิ = ได้แค่ ~3 samples ต่อ 10 วิ ค่อนข้างน้อย
  ถ้าอยากได้ resolution สูงกว่านี้ ต้องส่ง MQTT command ให้ ESP32 publish เร็วขึ้น (1 วิ) ตอนอยู่ใน
  session

  3 จุดนี้เป็น polish ไม่ใช่ fundamental — ปล่อยไว้ก่อนได้ ถ้าเป้าหมายคือ MVP
