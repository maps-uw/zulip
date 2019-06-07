var settings_notifications = (function () {

var exports = {};

var stream_notification_settings = [
    {setting: "enable_stream_desktop_notifications", notifications: "desktop_notifications"},
    {setting: "enable_stream_push_notifications", notifications: "push_notifications"},
    {setting: "enable_stream_sounds", notifications: "audible_notifications"},
    {setting: "enable_stream_email_notifications", notifications: "email_notifications"},
];

var pm_mention_notification_settings = [
    "enable_desktop_notifications",
    "enable_offline_email_notifications",
    "enable_offline_push_notifications",
    "enable_sounds",
];

var other_notification_settings = [
    "enable_all_favicon_dekstop_notifications",
    "pm_content_in_desktop_notifications",
    "enable_online_push_notifications",
    "notification_sound",
    "enable_digest_emails",
    "enable_login_emails",
    "realm_name_in_notifications",
    "message_content_in_email_notifications",
];

exports.notification_settings = other_notification_settings.concat(
    pm_mention_notification_settings,
    _.pluck(stream_notification_settings, 'setting')
);

function change_notification_setting(setting, setting_data, status_element) {
    var data = {};
    data[setting] = JSON.stringify(setting_data);
    settings_ui.do_settings_change(channel.patch, '/json/settings/notifications', data, status_element);
}

exports.set_enable_digest_emails_visibility = function () {
    if (page_params.realm_digest_emails_enabled) {
        $('#enable_digest_emails_label').parent().show();
    } else {
        $('#enable_digest_emails_label').parent().hide();
    }
};

exports.set_up = function () {
    _.each(pm_mention_notification_settings, function (setting) {
        $("#" + setting).change(function () {
            change_notification_setting(setting, $(this).prop('checked'),
                                        "#pm-mention-notify-settings-status");
        });
    });

    _.each(other_notification_settings, function (setting) {
        $("#" + setting).change(function () {
            var value;

            if (setting === "notification_sound") {
                // `notification_sound` is not a boolean.
                value = $(this).val();
            } else {
                value = $(this).prop('checked');
            }

            change_notification_setting(setting, value,
                                        "#other-notify-settings-status");
        });
    });

    _.each(stream_notification_settings, function (stream_setting) {
        var setting = stream_setting.setting;
        $("#" + setting).change(function () {
            var setting_data = $(this).prop('checked');
            change_notification_setting(setting, setting_data, "#stream-notify-settings-status");
        });
    });

    $("#play_notification_sound").click(function () {
        $("#notifications-area").find("audio")[0].play();
    });

    var notification_sound_dropdown = $("#notification_sound");
    notification_sound_dropdown.val(page_params.notification_sound);

    $("#enable_sounds, #enable_stream_sounds").change(function () {
        if ($("#enable_stream_sounds").prop("checked") || $("#enable_sounds").prop("checked")) {
            notification_sound_dropdown.prop("disabled", false);
            notification_sound_dropdown.parent().removeClass("control-label-disabled");
        } else {
            notification_sound_dropdown.prop("disabled", true);
            notification_sound_dropdown.parent().addClass("control-label-disabled");
        }
    });
    exports.set_enable_digest_emails_visibility();
};

exports.update_page = function () {
    _.each(exports.notification_settings, function (setting) {
        if (setting === 'enable_offline_push_notifications'
            && !page_params.realm_push_notifications_enabled) {
            // If push notifications are disabled at the realm level,
            // we should just leave the checkbox always off.
            return;
        }
        $("#" + setting).prop('checked', page_params[setting]);
    });
};

return exports;
}());

if (typeof module !== 'undefined') {
    module.exports = settings_notifications;
}
window.settings_notifications = settings_notifications;
