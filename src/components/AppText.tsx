import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';

const DEFAULT_FONT_FAMILY = 'SpaceGrotesk_400Regular';

export function Text({ style, ...props }: TextProps) {
  return (
    <RNText style={[{ fontFamily: DEFAULT_FONT_FAMILY }, style]} {...props} />
  );
}

export function TextInput({ style, ...props }: TextInputProps) {
  return (
    <RNTextInput
      style={[{ fontFamily: DEFAULT_FONT_FAMILY }, style]}
      {...props}
    />
  );
}
