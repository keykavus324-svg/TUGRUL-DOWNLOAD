package com.tugrul.studio;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * TUĞRUL DOWNLOAD — Android kabuğu.
 *
 * - Koyu durum çubuğu ve tam ekran uyumu
 * - Paylaş menüsünden gelen bağlantıyı uygulamaya aktarır (window.__TUGRUL_SHARE__)
 * - Geri tuşunda WebView geçmişini kullanır (SPA davranışı)
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Cihaz içi yt-dlp motoru (YtdlpPlugin) WebView'e açılır
        registerPlugin(YtdlpPlugin.class);
        super.onCreate(savedInstanceState);
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) {
            web.setBackgroundColor(0xFF07080C);
            web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        }
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShare(intent);
    }

    /** Paylaşılan metni arayüze iletir. */
    private void handleShare(Intent intent) {
        if (intent == null) return;
        String text = null;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            text = intent.getStringExtra(Intent.EXTRA_TEXT);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            text = intent.getData().toString();
        }
        if (text == null || text.trim().isEmpty()) return;

        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        final String payload = text.trim();
        web.post(() -> web.evaluateJavascript(
                "window.__TUGRUL_SHARE__ && window.__TUGRUL_SHARE__(" + quote(payload) + ")",
                null));
    }

    /** JavaScript string kaçışı. */
    private static String quote(String raw) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : raw.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.append('"').toString();
    }

    @Override
    public void onBackPressed() {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }
}
