export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-orange-50">
      <div className="text-center space-y-4 px-8">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-orange-400 flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl">🌅</span>
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">Cheewarun</h1>
            <p className="text-sm text-teal-600 font-medium">ชีวารุณ</p>
          </div>
        </div>
        <p className="text-gray-500 text-lg">รุ่งอรุณของชีวิตที่แข็งแรง</p>
        <div className="mt-8 inline-flex items-center gap-2 bg-white rounded-full px-5 py-2.5 shadow text-sm text-gray-600">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          กำลังพัฒนา — เร็ว ๆ นี้
        </div>
      </div>
    </div>
  );
}
