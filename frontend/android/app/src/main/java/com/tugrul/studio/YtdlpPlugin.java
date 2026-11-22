package com.tugrul.studio;

import android.Manifest;
import android.os.Build;
import android.os.Environment;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import kotlin.Unit;
import kotlin.jvm.functions.Function3;

/**
 * TUĞRUL DOWNLOAD — cihaz içi yt-dlp motoru.
 *
 * YTDLnis ile aynı yaklaşım: yt-dlp + Python + FFmpeg telefonun içinde çalışır,
 * sunucu gerekmez. Arayüz (WebView) bu eklenti üzerinden bilgi çözer, indirmeyi
 * başlatır ve ilerlemeyi `progress` olayıyla alır.
 *
 * Dosyalar herkese açık `Download/TUGRUL DOWNLOAD` klasörüne yazılır.
 */
@CapacitorPlugin(
        name = "TugrulYtdlp",
        permissions = {
                @Permission(alias = "storage", permissions = {Manifest.permission.WRITE_EXTERNAL_STORAGE})
        }
)
public class YtdlpPlugin extends Plugin {

    private static final String TAG = "TugrulYtdlp";
    private static final String FOLDER = "TUGRUL DOWNLOAD";

    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private volatile boolean ready = false;
    private volatile String initError = null;
    private Runnable pendingAction = null;

    // --- yardımcı ----------------------------------------------------------

    /** Hedef klasör: Download/TUGRUL DOWNLOAD (API 30+ izin gerektirmez). */
    private File outDir() {
        File base = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        return new File(base, FOLDER);
    }

    private boolean needsStoragePermission() {
        if (Build.VERSION.SDK_INT > 28) return false;
        try {
            return getContext().checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED;
        } catch (Throwable t) {
            return false;
        }
    }

    private void fail(PluginCall call, Throwable t) {
        Log.e(TAG, "işlem başarısız", t);
        String msg = t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
        // yt-dlp hata satırlarındaki renk kodlarını temizle
        msg = msg.replaceAll("\u001B\\[[;\\d]*m", "").replace("ERROR: ", "").trim();
        if (msg.length() > 400) msg = msg.substring(msg.length() - 400);
        call.reject(msg);
    }

    private static String tail(String s, int max) {
        if (s == null) return "";
        String clean = s.replaceAll("\u001B\\[[;\\d]*m", "").trim();
        return clean.length() <= max ? clean : clean.substring(clean.length() - max);
    }

    private static List<String> listNames(File dir) {
        List<String> out = new ArrayList<>();
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) out.add(f.getName());
        return out;
    }

    /** İndirme sonrası klasöre eklenen (ya da en son değişen) dosyayı bul. */
    private static String newestFile(File dir, Set<String> before) {
        File[] files = dir.listFiles();
        if (files == null || files.length == 0) return null;
        File best = null;
        for (File f : files) {
            if (!f.isFile()) continue;
            if (f.getName().endsWith(".part") || f.getName().endsWith(".ytdl")) continue;
            if (best == null || f.lastModified() > best.lastModified()) best = f;
        }
        // önce "yeni eklenen" dosyayı tercih et
        for (File f : files) {
            if (f.isFile() && !before.contains(f.getName())
                    && !f.getName().endsWith(".part") && !f.getName().endsWith(".ytdl")) {
                return f.getAbsolutePath();
            }
        }
        return best == null ? null : best.getAbsolutePath();
    }

    private String safeVersion() {
        try {
            String v = YoutubeDL.INSTANCE.version(getContext());
            return v == null ? "" : v;
        } catch (Throwable t) {
            return "";
        }
    }

    /** Python + yt-dlp'yi hazırla (ilk açılışta birkaç saniye sürebilir). */
    private synchronized void ensureInit() throws Exception {
        if (ready) return;
        YoutubeDL.INSTANCE.init(getContext());
        try {
            FFmpeg.INSTANCE.init(getContext());
        } catch (Throwable t) {
            // FFmpeg yoksa ses dönüştürme çalışmaz ama indirme çalışır
            Log.w(TAG, "ffmpeg hazırlanamadı: " + t);
        }
        ready = true;
        initError = null;
    }

    // --- API ---------------------------------------------------------------

    /** Motoru hazırlar. İlk çağrıda Python/yt-dlp/FFmpeg diske açılır. */
    @PluginMethod
    public void init(PluginCall call) {
        call.setKeepAlive(true);
        pool.execute(() -> {
            JSObject ret = new JSObject();
            try {
                ensureInit();
                ret.put("ok", true);
                ret.put("version", safeVersion());
                ret.put("dir", outDir().getAbsolutePath());
                ret.put("engine", "on-device");
                call.resolve(ret);
            } catch (Throwable t) {
                initError = t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
                ret.put("ok", false);
                ret.put("detail", initError);
                call.resolve(ret);
            }
        });
    }

    /** Motor durumu (arayüz rozetleri için). */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ready", ready);
        ret.put("error", initError == null ? "" : initError);
        ret.put("dir", outDir().getAbsolutePath());
        ret.put("version", ready ? safeVersion() : "");
        ret.put("engine", "on-device");
        call.resolve(ret);
    }

    /** Bağlantıyı çözer: yt-dlp `--dump-single-json` çıktısını olduğu gibi döndürür. */
    @PluginMethod
    public void info(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Bağlantı boş");
            return;
        }
        call.setKeepAlive(true);
        pool.execute(() -> {
            try {
                ensureInit();
                YoutubeDLRequest req = new YoutubeDLRequest(url.trim());
                req.addOption("--dump-single-json");
                req.addOption("--no-warnings");
                req.addOption("--no-playlist");
                req.addOption("--no-cache-dir");
                req.addOption("--socket-timeout", "20");
                YoutubeDLResponse resp = YoutubeDL.INSTANCE.execute(req, null, null);
                JSObject ret = new JSObject();
                ret.put("ok", resp.getExitCode() == 0);
                ret.put("exitCode", resp.getExitCode());
                ret.put("stdout", resp.getOut());
                ret.put("stderr", tail(resp.getErr(), 500));
                call.resolve(ret);
            } catch (Throwable t) {
                fail(call, t);
            }
        });
    }

    /** İndirmeyi başlatır; ilerleme `progress` olayıyla yayınlanır. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Bağlantı boş");
            return;
        }
        call.setKeepAlive(true);
        if (needsStoragePermission()) {
            pendingAction = () -> startDownload(call);
            requestPermissionForAlias("storage", call, "storageResult");
            return;
        }
        pool.execute(() -> startDownload(call));
    }

    private void startDownload(PluginCall call) {
        String url = call.getString("url", "").trim();
        String id = call.getString("id", "0");
        String type = call.getString("type", "video");
        String format = call.getString("format", "");
        String template = call.getString("template", "%(title)s.%(ext)s");
        try {
            ensureInit();
            File dir = outDir();
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("İndirme klasörü oluşturulamadı: " + dir.getAbsolutePath());
                return;
            }
            Set<String> before = new HashSet<>(listNames(dir));

            YoutubeDLRequest req = new YoutubeDLRequest(url);
            req.addOption("-o", new File(dir, template).getAbsolutePath());
            req.addOption("--newline");
            req.addOption("--no-playlist");
            req.addOption("--no-cache-dir");
            req.addOption("--restrict-filenames");
            req.addOption("--socket-timeout", "20");
            req.addOption("--retries", "3");
            if ("audio".equals(type)) {
                req.addOption("-x");
                req.addOption("--audio-format", "mp3");
                req.addOption("--audio-quality", "0");
            } else if (format != null && !format.isEmpty()) {
                req.addOption("-f", format);
            } else {
                req.addOption("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best");
            }

            String processId = "tug-" + id;
            Function3<Float, Long, String, Unit> cb = (progress, eta, line) -> {
                JSObject ev = new JSObject();
                ev.put("id", id);
                ev.put("progress", progress == null ? 0d : progress.doubleValue());
                ev.put("eta", eta == null ? -1L : eta.longValue());
                if (line != null) ev.put("line", line);
                notifyListeners("progress", ev);
                return Unit.INSTANCE;
            };

            YoutubeDLResponse resp = YoutubeDL.INSTANCE.execute(req, processId, cb);
            JSObject ret = new JSObject();
            ret.put("ok", resp.getExitCode() == 0);
            ret.put("exitCode", resp.getExitCode());
            ret.put("stderr", tail(resp.getErr(), 400));
            String path = newestFile(dir, before);
            ret.put("path", path == null ? "" : path);
            ret.put("size", path == null ? 0L : new File(path).length());
            call.resolve(ret);
        } catch (Throwable t) {
            fail(call, t);
        }
    }

    /** Çalışan indirmeyi durdurur. */
    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id", "0");
        boolean ok = false;
        try {
            ok = YoutubeDL.INSTANCE.destroyProcessById("tug-" + id);
        } catch (Throwable t) {
            Log.w(TAG, "iptal edilemedi: " + t);
        }
        JSObject ret = new JSObject();
        ret.put("ok", ok);
        call.resolve(ret);
    }

    // --- izinler -----------------------------------------------------------

    @PermissionCallback
    private void storageResult(PluginCall call) {
        Runnable action = pendingAction;
        pendingAction = null;
        if (action != null) {
            pool.execute(action);
        } else {
            call.resolve();
        }
    }

    @Override
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("storage", getPermissionState("storage").toString().toLowerCase());
        call.resolve(ret);
    }

    @Override
    public void requestPermissions(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("storage", "granted");
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("storage", call, "permissionsResult");
    }

    @PermissionCallback
    private void permissionsResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("storage", getPermissionState("storage").toString().toLowerCase());
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        pool.shutdownNow();
    }
}
