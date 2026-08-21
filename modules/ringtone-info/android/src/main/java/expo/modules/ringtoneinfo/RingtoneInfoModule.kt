package expo.modules.ringtoneinfo

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The phone's own ringtones: what they are called, and ringing them.
 *
 * Both jobs exist because Android will not let JavaScript near them. The picker
 * hands back a URI and drops the label it had just shown, and RingtoneManager is
 * the only way to ask for it again.
 *
 * Playing needs native code for two separate reasons. A tone lives behind a
 * content provider, and MediaPlayer.setDataSource(context, uri) reads it through
 * that provider with the app's own identity, which is how it succeeds where a
 * plain file read is refused. And an alarm belongs on the alarm stream: passing
 * USAGE_ALARM puts it under the phone's alarm slider, so a reminder is still
 * heard on a phone with the media volume turned down.
 */
class RingtoneInfoModule : Module() {
  /** The tone currently ringing, if any. Only ever touched on the main thread. */
  private var player: MediaPlayer? = null

  private fun release() {
    val current = player ?: return
    player = null
    runCatching { if (current.isPlaying) current.stop() }
    runCatching { current.release() }
  }

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

    /**
     * Start `uri` and say whether it really began. False covers a tone that has
     * been deleted, one this app may not read, and a phone that refused the
     * stream: the caller answers all three the same way, by ringing its own tone
     * instead.
     */
    AsyncFunction("play") { uri: String, loop: Boolean ->
      val context = appContext.reactContext
      if (context == null) {
        false
      } else {
        release()
        runCatching {
          val next = MediaPlayer()
          next.setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
          next.setDataSource(context, Uri.parse(uri))
          next.isLooping = loop
          // Local files, so preparing is quick and the synchronous form keeps
          // the answer honest: by the time this returns, it is either ringing or
          // it threw.
          next.prepare()
          next.start()
          player = next
          next.isPlaying
        }.getOrElse {
          release()
          false
        }
      }
    }

    AsyncFunction("stop") {
      release()
    }

    // A reload or a shutdown with a tone still ringing would otherwise leave it
    // ringing with nothing left to stop it.
    OnDestroy {
      release()
    }
  }
}
