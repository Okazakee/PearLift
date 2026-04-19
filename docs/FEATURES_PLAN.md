# PearLift Features Plan

## Planned Features

### Tablet layout
- Adjust the app to have a good tablet layout

### Device Authorization (Fingerprint/PIN)
- Require biometric or PIN when new device attempts to sync
- Store trusted devices list locally
- Show notification when new device requests sync access

### Friends Workouts
- Share workout programs with friends via Nostr
- View friends' public workout programs
- Follow/unfollow friends

## Implementation Notes

- Device auth will require sync coordinator updates
- Friends features depend on Nostr relay integration