package expo.modules.ringtoneinfo

import android.media.RingtoneManager
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The name behind a ringtone URI.
 *
 * Android's tone picker hands back a URI and nothing else, so the label it had
 * just shown the user is lost. RingtoneManager can look it up again, and that
 * is the whole of this module's job. Nothing here writes or plays anything.
 */
class RingtoneInfoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RingtoneInfo")

    // Reading the title goes to a content provider, so it is kept off the main
    // thread. Failure is answered with null rather than an error: a tone with no
    // name still works perfectly well, it just gets a generic label.
    AsyncFunction("titleFor") { uri: String ->
      val context = appContext.reactContext
      if (context == null) {
        null
      } else {
        runCatching { RingtoneManager.getRingtone(context, Uri.parse(uri))?.getTitle(context) }
          .getOrNull()
      }
    }
  }
}
