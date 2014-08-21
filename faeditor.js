var midiAccess = null;
var inputs = null;
var input = null;
var outputs = null;
var output = null;
var input_device = 0;
var output_device = 0;
var midi_ch = 1;
var isFA = false;

var device_id = 0x10;

// 機器から取得したデータ及び機器に転送するデータ
var studio_set_common_data = new Array(0x5d);
var sn_synth_tone_common_data = new Array(0x32);
var sn_synth_tone_partial_data = new Array(0x03);
sn_synth_tone_partial_data[0] = new Array(0x3d);
sn_synth_tone_partial_data[1] = new Array(0x3d);
sn_synth_tone_partial_data[2] = new Array(0x3d);

var name_addr = new Array();
name_addr["osc_type"] = 0x00;
name_addr["osc_var"] = 0x01;
name_addr["osc_ssaw_detune"] = 0x3a;
name_addr["osc_var"] = 0x01;
name_addr["filter_cutoff"] = 0x0c;
name_addr["filter_res"] = 0x0f;
name_addr["filter_A"] = 0x10;
name_addr["filter_D"] = 0x11;
name_addr["filter_S"] = 0x12;
name_addr["filter_R"] = 0x13;
name_addr["filter_depth"] = 0x14;
name_addr["amp_pan"] = 0x1b;
name_addr["amp_level"] = 0x15;
name_addr["amp_A"] = 0x17;
name_addr["amp_D"] = 0x18;
name_addr["amp_S"] = 0x19;
name_addr["amp_R"] = 0x1a;

// 汎用
String.prototype.rtrim = function() {
	return this.replace(/\s+$/, "");
}

function StringFromCharCodeArray()
{
	var res = "";
	var n = 0;
	if (arguments.length == 1) {
		n = (arguments[0]).length;
	} else if (arguments.length == 2) {
		n = parseInt(arguments[1]);
	}
	for (var i = 0; i < n; i++) {
		res += String.fromCharCode((arguments[0])[i]);
	}
	
	return res;
}

function aryncmp(a, b, n)
{
	// ２つの配列aとbを先頭からnまで比較する
	if (n > a.length || n > b.length) return false;
	
	for (var i = 0; i <= n; i++) {
		if (a[i] != b[i]) return false;
	}
	
	return true;
}

function initMIDI()
{
	navigator.requestMIDIAccess( { sysex: true } ).then((function(midi) {
		// MIDIデバイスが使用可能
		midiAccess = midi;
		if (midiAccess != null) {

			outputs = midiAccess.outputs();
			inputs = midiAccess.inputs();

			if(outputs.length > 0){
				for (var i = 0; i < outputs.length; i++) {
					document.getElementById("midiout_select").innerHTML += ('<option value=' + i + '>' + outputs[i].name + '</option>');
				}
			}
			if(inputs.length > 0){
				for (var i = 0; i < inputs.length; i++) {
					document.getElementById("midiin_select").innerHTML += ('<option value=' + i + '>' + inputs[i].name + '</option>');
				}
			}
		}
	}), (function() {
		alert( "MIDIが使えません。" );
	}));
}

function onMidiOutChange(item)
{
	output_device = document.getElementById("midiout_select").value;
	output = outputs[output_device];
	isFA = false;
	document.getElementById("FA-06_detected").style.display = 'none';
    document.getElementById("FA-08_detected").style.display = 'none';
	document.getElementById("no_fa_detected").style.display = 'block';
	sendIdentityRequestMessage();
}

function onMidiInChange(item)
{
	input_device = document.getElementById("midiin_select").value;
	input = inputs[input_device];
	isFA = false;
	input.onmidimessage = onMIDIMessage;
	document.getElementById("FA-06_detected").style.display = 'none';
    document.getElementById("FA-08_detected").style.display = 'none';
	document.getElementById("no_fa_detected").style.display = 'block';
	sendIdentityRequestMessage();
}

function onMidiChannelSelectChange(item)
{
	midi_ch = parseInt(document.getElementById("midi_channel_select").value);
	console.log(midi_ch);
	recieveAll();
}

function onMIDIMessage(event)
{
	// 送られてきたデータの処理を行う
	var e_data = event.data;
	var str = "";
	var dt1 = [0xf0, 0x41, device_id, 0x00, 0x00, 0x77, 0x12];
	var irm_fa06 = [0xf0, 0x7e, device_id, 0x06, 0x02, 0x41, 0x77, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf7];
	var irm_fa08 = [0xf0, 0x7e, device_id, 0x06, 0x02, 0x41, 0x77, 0x02, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0xf7];
	
	if (e_data[0] == 0xfe) {
		return;
		
	} else if (aryncmp(e_data, irm_fa06, 15) || aryncmp(e_data, irm_fa08, 15)) {
		if (e_data[10] == 0x00) {
			document.getElementById("FA-06_detected").style.display = 'block';
		} else if (e_data[10] == 0x01) {
			document.getElementById("FA-08_detected").style.display = 'block';
		}
		document.getElementById("no_fa_detected").style.display = 'none';
		isFA = true;
		recieveAll();
		
	} else if ((e_data[0] & 0xf0) == 0xC0) {
		// プログラムチェンジがかかったのですべての情報を更新する
		recieveAll();
		
	} else if (aryncmp(e_data, dt1, 6)) {
		// DT1
		 if (e_data[7] == 0x18) {
			 // Studio Set Commonあたりの変更
			 for (var i = 11; i < e_data.length - 2; i++) {
				studio_set_common_data[i - 11] = e_data[i]
			} 
			
			// 入力ボックスのStudioSet名を更新する
			 document.getElementById("studio_set_name").value = StringFromCharCodeArray(studio_set_common_data, 16).rtrim();
			
		} else if (0x19 <= e_data[7] && e_data[7] <= 0x1c) {
			if (e_data[9] == 0x00) {
				// SuperNATURAL Synth Tone Commonあたりの変更
				for (var i = 11; i < e_data.length - 2; i++) {
					sn_synth_tone_common_data[i - 11] = e_data[i]
				}

				// 入力ボックスのトーン名を更新する
				document.getElementById("tone_name").value = StringFromCharCodeArray(sn_synth_tone_common_data, 12).rtrim();

				// POLY MONOを更新する
				document.getElementById("sns_c_polymono").value = sn_synth_tone_common_data[0x14];
				
				// PartialのON/OFFを更新する
				for (var i = 0; i < 3; i++) {
					if (sn_synth_tone_common_data[0x19 + i * 2] == 0) {
						document.getElementById("sns_" + (i + 1) + "_partial_onoff").checked = false;
					} else {
						document.getElementById("sns_" + (i + 1) + "_partial_onoff").checked = true;
					}
				}
			   
			   document.getElementById("sns_c_waveshape").innerHTML = "Wave Shape: " + sn_synth_tone_common_data[0x35].toString();
				
			} else if (0x20 <= e_data[9] && e_data[9] <= 0x22) {
				// Partial e_data[9] - 0x1f
				var part_num = (e_data[9] - 0x1f);
				
				for (var i = 11; i < e_data.length - 2; i++) {
					sn_synth_tone_partial_data[part_num - 1][i - 11] = e_data[i];
				}
				
				for (var key in name_addr) {
					document.getElementById("sns_" + part_num + "_" + key).value = sn_synth_tone_partial_data[part_num - 1][name_addr[key]];
				}
				
				 // PCM Wave Numberを更新する
				document.getElementById("sns_" + part_num + "_osc_pcm_wavenumber").value = (sn_synth_tone_partial_data[part_num - 1][0x35] << 12) + (sn_synth_tone_partial_data[part_num - 1][0x36] << 8) + (sn_synth_tone_partial_data[part_num - 1][0x37] << 4) + (sn_synth_tone_partial_data[part_num - 1][0x38]);
				
			}
		}
	}
			
	// logに書き込む
	if(e_data.length > 1) {
		str += "length = 0x" + e_data.length.toString(16) + " : 0x" + e_data[0].toString(16) + " ";

		for(var i = 1; i < e_data.length; i++) {
			str += "0x" + e_data[i].toString(16) + " ";
		}
	}
	console.log(str + "\n");
}

function getCheckSum(addr_data_arry)
{
	var sum = addr_data_arry.reduce(function(a, b) {return a + b;});
	return (128 - (sum % 128)) & 0x7f;
}

function sendDT1(addr_ary, data_ary)
{
	var dt1_head = [0xf0, 0x41, device_id, 0x00, 0x00, 0x77, 0x12];
	var dt1_addr_data = addr_ary.concat(data_ary);
	var dt1_tail = [0x00/*チェックサム*/, 0xf7];
	dt1_tail[0] = getCheckSum(dt1_addr_data);
	if (isFA) output.send(dt1_head.concat(dt1_addr_data, dt1_tail));
}

function sendRQ1(addr_ary, size_ary)
{
	var rq1_head = [0xf0, 0x41, device_id, 0x00, 0x00, 0x77, 0x11];
	var rq1_addr_size = addr_ary.concat(size_ary);
	var rq1_tail = [0x00/*チェックサム*/, 0xf7];
	rq1_tail[0] = getCheckSum(rq1_addr_size);
	if (isFA) output.send(rq1_head.concat(rq1_addr_size, rq1_tail));
}

function getFormattedName(name_strings, len)
{
	
	var name_array = new Array(len);
	
	for (var i = 0; i < len; i++) {
		name_array[i] = 0x20;
	}
	for (var i = 0; i < name_strings.length; i++) {
		name_array[i] = name_strings.charCodeAt(i);
	}
	return name_array;
}

function onStudioSetNameChange(item)
{
	// StudioSetの名前が変更されたので新しい名前を送信する
	sendDT1([0x18, 0x00, 0x00, 0x00], getFormattedName(document.getElementById('studio_set_name').value, 16));
}

function sendIdentityRequestMessage()
{
	if (output != null) output.send([0xf0, 0x7e, device_id, 0x06, 0x01, 0xf7]);
}

function recieveAll()
{
	// FAからすべての情報を読み込む(ようにRQ1を送信する)
	
	// Studio Set Common
	sendRQ1([0x18, 0x00, 0x00, 0x00], [0x00, 0x00, 0x00, 0x5d]);
	
	// SuperNATURAL Synth Tone Common
	sendRQ1([0x19 + ((midi_ch - 1) >> 2), ((((midi_ch - 1) & 0x03) * 2) << 0x04) + 0x01, 0x00, 0x00], [0x00, 0x00, 0x00, 0x40]);
	
	// SuperNATURAL Synth Tone Partial 1-3
	for (var i = 0; i < 3; i++) {
		sendRQ1([0x19 + ((midi_ch - 1) >> 2), ((((midi_ch - 1) & 0x03) * 2) << 0x04) + 0x01, 0x20 + i, 0x00], [0x00, 0x00, 0x00, 0x3d]);
	}
}

function onSnsPartialChange(item, name)
{
	// 変更が加えられたのでシンセに変更を適応する
	
	var common_addr = [0x19 + ((midi_ch - 1) >> 2), ((((midi_ch - 1) & 0x03) * 2) << 0x04) + 0x01];
	var partial_addr = [0x19 + ((midi_ch - 1) >> 2), ((((midi_ch - 1) & 0x03) * 2) << 0x04) + 0x01, 0x20];
	if (name == "common") {
		// Commonの設定変更
		
		// 名前
		sendDT1([0x19 + ((midi_ch - 1) >> 2), ((((midi_ch - 1) & 0x03) * 2) << 0x04) + 0x01, 0x00, 0x00], getFormattedName(document.getElementById('tone_name').value, 12));
		// MONO POLY変更
		sendDT1(common_addr.concat([0x00, 0x14]), [document.getElementById("sns_c_polymono").value]);
		
		// PartialのONOFF
		var onoff;
		for (var i = 1; i <= 3; i++) {
			onoff = 0
			if (document.getElementById("sns_" + i + "_partial_onoff").checked == true) {
				onoff = 1;
			}
			sendDT1(common_addr.concat([0x00, 0x19 + (i - 1) * 2]), [onoff]);
		}
		
	} else {
        // Partialの設定変更
        partial_addr[2] += (name.charCodeAt(4) - "1".charCodeAt(0));

        for (var key in name_addr) {
            sendDT1(partial_addr.concat([name_addr[key]]), parseInt([document.getElementById(name + key).value]));
        }
	
        var pcmnum = parseInt(document.getElementById(name + "osc_pcm_wavenumber").value);
        var pcmnum_ary = [(pcmnum & 0xf000) >> 12, (pcmnum & 0x0f00) >> 8, (pcmnum & 0x0f0) >> 4, (pcmnum & 0x00f)];
        console.log(pcmnum_ary.toString(16));
        sendDT1(partial_addr.concat([0x35]), pcmnum_ary);
	}
}

