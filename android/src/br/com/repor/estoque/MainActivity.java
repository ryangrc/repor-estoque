package br.com.repor.estoque;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import java.util.List;

/** Uses the browser's secure session, including the hosting provider's sign-in. */
public final class MainActivity extends Activity {
    private static final String SITE = "https://repor-estoque-ryan.rrreis.chatgpt.site";
    private static final String CUSTOM_TABS_SERVICE =
        "android.support.customtabs.action.CustomTabsService";
    private static final int OPEN_REPOR = 100;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (state == null) openRepor();
    }

    private void openRepor() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(SITE));
        // A null session is the documented low-level Custom Tabs protocol.
        Bundle options = new Bundle();
        options.putBinder("android.support.customtabs.extra.SESSION", null);
        intent.putExtras(options);
        intent.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", Color.rgb(36, 92, 230));
        intent.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
        intent.putExtra("android.support.customtabs.extra.ENABLE_URLBAR_HIDING", true);
        String browser = findBrowser(intent);
        if (browser != null) intent.setPackage(browser);
        try {
            startActivityForResult(intent, OPEN_REPOR);
        } catch (ActivityNotFoundException unavailable) {
            // Browsers without Custom Tabs still support standard HTTPS navigation.
            try {
                startActivityForResult(new Intent(Intent.ACTION_VIEW, Uri.parse(SITE)), OPEN_REPOR);
            } catch (ActivityNotFoundException noBrowser) {
                new AlertDialog.Builder(this)
                    .setTitle("Abra o Repor com um navegador")
                    .setMessage("Ative ou instale um navegador, como o Chrome, e abra o Repor novamente. O aplicativo precisa de internet.")
                    .setPositiveButton("Fechar", new DialogInterface.OnClickListener() {
                        @Override public void onClick(DialogInterface dialog, int which) { finish(); }
                    })
                    .setOnCancelListener(new DialogInterface.OnCancelListener() {
                        @Override public void onCancel(DialogInterface dialog) { finish(); }
                    })
                    .show();
            }
        }
    }

    private String findBrowser(Intent view) {
        PackageManager manager = getPackageManager();
        ResolveInfo preferred = manager.resolveActivity(view, PackageManager.MATCH_DEFAULT_ONLY);
        List<ResolveInfo> browsers = manager.queryIntentActivities(view, 0);
        String first = null;
        for (ResolveInfo candidate : browsers) {
            String name = candidate.activityInfo.packageName;
            Intent service = new Intent(CUSTOM_TABS_SERVICE).setPackage(name);
            if (manager.resolveService(service, 0) == null) continue;
            if (preferred != null && preferred.activityInfo != null
                    && name.equals(preferred.activityInfo.packageName)) return name;
            if (first == null) first = name;
        }
        return first;
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OPEN_REPOR) finish();
    }
}
