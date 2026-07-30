declare module 'react-native-get-sms-android' {
  type SmsAndroid = {
    list: (
      filter: string,
      fail: (error: string) => void,
      success: (count: number, smsList: string) => void,
    ) => void;
  };
  const SmsAndroid: SmsAndroid;
  export default SmsAndroid;
}
