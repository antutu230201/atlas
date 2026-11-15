/**
 * 离线状态横幅（宪法 §4-2 一致性：状态不误导——离线时明确告知数据暂不可用）。
 *
 * 实现为服务端渲染的静态标记 + 内联脚本，而非 React 状态：离线场景下 React
 * 水合本身可能失败（chunk/RSC 拉取失败），横幅恰恰要在那个时刻可靠显示。
 * API 层永不缓存（SW 策略），恢复网络后数据自动回到网络口径，无冲突处理负担。
 */
export function OfflineBanner() {
  return (
    <>
      <div
        id="offline-banner"
        data-testid="offline-banner"
        role="status"
        hidden
        suppressHydrationWarning
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 border-t border-border bg-surface/95 px-4 py-2.5 text-xs font-medium text-text shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm"
      >
        <span aria-hidden>⚡</span>
        当前离线——页面为缓存快照，数据暂不可用；恢复网络后自动重试。
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){
  function update(){
    var el = document.getElementById('offline-banner');
    if (el) el.hidden = navigator.onLine;
  }
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
})();`,
        }}
      />
    </>
  );
}
