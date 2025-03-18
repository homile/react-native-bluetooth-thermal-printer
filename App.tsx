import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  FlatList,
  PermissionsAndroid,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { btoa, atob } from 'react-native-quick-base64';

export default function App() {
  const bleManager = new BleManager();
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [writeCharacteristic, setWriteCharacteristic] =
    useState<Characteristic | null>(null);

  useEffect(() => {
    const requestPermissions = async () => {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      if (granted['android.permission.ACCESS_FINE_LOCATION'] === 'granted') {
        console.log('권한 허용됨');
      }
    };
    requestPermissions();
  }, []);

  // 블루투스 장치 스캔
  const startScan = () => {
    console.log('스캔 시작');
    setDevices([]); // 기존 목록 초기화
    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error(error);
        return;
      }

      if (device) {
        setDevices((prev) => {
          const exists = prev.some((d) => d.id === device.id);
          return exists ? prev : [...prev, device];
        });
      }
    });

    // 10초 후 스캔 중지
    setTimeout(() => {
      bleManager.stopDeviceScan();
      console.log('스캔 종료');
    }, 10000);
  };

  // 프린터 연결
  const connectToPrinter = async (device: Device) => {
    try {
      const connected = await device.connect();
      const discovered =
        await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);

      // 쓰기가 가능한 특성 찾기
      const services = await discovered.services();
      for (const service of services) {
        const characteristics = await service.characteristics();
        for (const char of characteristics) {
          if (char.isWritableWithoutResponse) {
            setWriteCharacteristic(char);
            console.log('쓰기 가능한 특성 발견:', char.uuid);
            return;
          }
        }
      }

      console.warn('쓰기 가능한 특성을 찾지 못함');
    } catch (error) {
      console.error('연결 실패:', error);
    }
  };

  // ArrayBuffer -> Base64 변환
  const arrayBufferToBase64 = (buffer: Uint8Array) => {
    return btoa(String.fromCharCode.apply(null, Array.from(buffer)));
  };

  // 데이터 전송 공통 함수
  const sendPrintData = async (data: Uint8Array) => {
    if (!writeCharacteristic) return;

    try {
      const base64Data = arrayBufferToBase64(data);
      await writeCharacteristic.writeWithoutResponse(base64Data);
    } catch (error) {
      console.error('데이터 전송 오류:', error);
    }
  };

  // ESC/POS 명령어를 이용한 영수증 출력
  const printTestReceipt = async () => {
    const encoder = new TextEncoder();

    // ESC/POS 명령어 조합
    const commands = [
      '\x1B@', // 초기화
      '\x1B!\x00', // 기본 텍스트 모드
      '\x1B\x61\x01', // 가운데 정렬
      '테스트 영수증\n\n',
      '================\n',
      '\x1B\x45\x01', // 강조 모드
      '성공적으로 출력되었습니다!\n',
      '\x1B\x45\x00', // 강조 모드 해제
      '\x1D\x56\x41\x10', // 용지 절단
    ];

    for (const cmd of commands) {
      await sendPrintData(encoder.encode(cmd));
      await new Promise((resolve) => setTimeout(resolve, 50)); // 지연 추가
    }
  };

  // 장치 리스트 렌더링
  const renderDeviceItem = ({ item }: { item: Device }) => {
    if (!item.name) return null;

    return (
      <Pressable
        style={styles.deviceItem}
        onPress={() => connectToPrinter(item)}
      >
        <Text>{item.name || 'Unnamed Device'}</Text>
        <Text style={styles.deviceId}>{item.id}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Text>bluetooth-thermal-printer</Text>

      <Pressable style={styles.button} onPress={startScan}>
        <Text style={styles.buttonText}>블루투스 장치 스캔</Text>
      </Pressable>

      {connectedDevice && (
        <Pressable style={styles.button} onPress={printTestReceipt}>
          <Text style={styles.buttonText}>영수증 출력</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>발견된 장치:</Text>
      <FlatList
        data={devices}
        renderItem={renderDeviceItem}
        keyExtractor={(item) => item.id}
        style={styles.deviceList}
      />

      {connectedDevice && (
        <Text style={styles.connectedText}>
          연결된 장치: {connectedDevice.name}
        </Text>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 5,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  deviceList: {
    width: '80%',
    marginTop: 10,
  },
  deviceItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
  },
  sectionTitle: {
    marginTop: 20,
    fontWeight: 'bold',
  },
  connectedText: {
    marginTop: 15,
    color: 'green',
  },
});
