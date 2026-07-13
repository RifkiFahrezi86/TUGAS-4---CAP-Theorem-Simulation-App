# Penjelasan CAP Theorem

Dokumen ini dibuat dari isi slide KLP4_CAP Theorem.pptx, lalu disesuaikan dengan materi yang sudah Anda pelajari, terutama:

- Modul 5: Storage Systems dan Consistency
- Modul 1: System Design Framework
- Sedikit terkait Modul 8: sistem global dan tantangan consistency

---

## 1. Inti Materi PPT

PPT ini membahas CAP Theorem, yaitu prinsip dasar dalam sistem terdistribusi yang menjelaskan bahwa saat terjadi gangguan komunikasi antar-node, sistem tidak bisa sekaligus menjaga konsistensi penuh dan ketersediaan penuh tanpa kompromi.

Kalau dijelaskan dengan sangat sederhana:

- sistem modern biasanya berjalan di banyak server
- banyak server berarti ada risiko jaringan antar-server terganggu
- saat gangguan itu terjadi, sistem harus memilih prioritas
- prioritasnya biasanya antara data tetap seragam atau layanan tetap selalu merespons

Jadi inti CAP Theorem bukan sekadar hafalan C, A, P, tetapi memahami trade-off saat sistem menghadapi network partition.

---

## 2. Hubungan dengan Modul yang Sudah Dipahami

### Modul 5 - Storage Systems dan Consistency

Ini adalah modul yang paling dekat dengan isi PPT.

Hubungannya:

- CAP Theorem menjelaskan trade-off consistency dan availability
- replication membuat availability naik, tetapi consistency jadi lebih menantang
- eventual consistency cocok untuk sistem yang memilih availability lebih tinggi
- strong consistency cocok untuk sistem yang mengutamakan kebenaran data

### Modul 1 - System Design Framework

Di modul ini Anda belajar bahwa setiap keputusan desain harus berdasarkan kebutuhan sistem.

Hubungannya:

- CAP membantu menjawab prioritas non-functional requirement
- jika data sangat kritis, sistem cenderung memilih consistency
- jika layanan harus selalu aktif, sistem cenderung lebih toleran pada data yang sedikit terlambat

### Modul 8 - CDN, Edge, dan Global Distribution

Saat sistem tersebar ke banyak lokasi, jaringan antar wilayah makin sulit dipastikan selalu stabil.

Hubungannya:

- makin global sistemnya, makin realistis kemungkinan partition
- karena itu trade-off CAP makin penting dipahami

---

## 3. Apa Itu Sistem Terdistribusi?

Sistem terdistribusi adalah sekumpulan komputer atau node yang saling terhubung melalui jaringan, tetapi bagi pengguna terlihat seperti satu sistem.

Karakteristik utamanya:

- banyak node bekerja bersama
- komunikasi terjadi lewat jaringan
- tidak ada jam global tunggal yang sempurna
- kegagalan satu node tidak selalu membuat seluruh sistem mati

Contoh sistem terdistribusi:

- layanan cloud
- perbankan online
- database terdistribusi
- marketplace besar
- media sosial

Mengapa ini penting?

Karena CAP Theorem hanya relevan ketika sistem sudah benar-benar terdistribusi, bukan saat semuanya masih berada di satu mesin sederhana.

---

## 4. Apa Itu CAP Theorem?

CAP adalah singkatan dari:

- Consistency
- Availability
- Partition Tolerance

Makna sederhananya:

- C = semua node melihat data terbaru yang sama
- A = setiap request selalu mendapat respons
- P = sistem tetap berjalan walaupun komunikasi antar-node terganggu

### Definisi Mudah

CAP Theorem menyatakan bahwa pada sistem terdistribusi, ketika terjadi network partition, sistem harus memilih untuk lebih memprioritaskan consistency atau availability.

### Catatan Penting

Ini adalah bagian analisis yang penting untuk dipahami baik-baik.

Penjelasan populer sering berbunyi “pilih 2 dari 3”. Kalimat itu membantu untuk mengingat, tetapi versi yang lebih tepat adalah:

- saat kondisi normal, sistem bisa saja terlihat memiliki consistency dan availability sekaligus
- tetapi saat network partition benar-benar terjadi, sistem tidak bisa mempertahankan keduanya secara penuh pada saat yang sama

Jadi pusat persoalan CAP sebenarnya muncul saat partition terjadi.

---

## 5. Properti C - Consistency

Consistency berarti setelah data ditulis, semua pembacaan berikutnya pada node mana pun akan melihat data terbaru yang sama.

Maknanya:

- tidak ada node yang menampilkan versi lama saat read seharusnya sudah melihat versi baru
- sistem menjaga agar semua salinan data tetap seragam

### Kelebihan

- data lebih akurat
- cocok untuk transaksi sensitif
- kecil kemungkinan user melihat data yang saling bertentangan

### Kekurangan

- latensi bisa lebih tinggi
- jika ada gangguan jaringan, sebagian request bisa ditolak
- availability bisa turun saat sistem memaksa sinkronisasi

### Contoh Cocok

- saldo rekening
- pembayaran
- data transaksi keuangan
- data medis yang sangat sensitif

### Hubungan dengan Modul 5

Ini dekat dengan konsep strong consistency.

---

## 6. Properti A - Availability

Availability berarti setiap request ke node yang masih aktif akan selalu mendapatkan respons, walaupun data yang dikembalikan belum tentu yang paling baru.

Maknanya:

- sistem mengutamakan tetap menjawab
- user lebih jarang menemui layanan yang menolak request

### Kelebihan

- layanan tetap aktif
- respon biasanya cepat
- cocok untuk skala besar dan trafik tinggi

### Kekurangan

- data bisa sementara usang
- antar-node bisa menampilkan nilai berbeda untuk sementara
- potensi konflik lebih besar sebelum sinkron kembali

### Contoh Cocok

- feed media sosial
- analytics
- sistem rekomendasi
- data yang boleh terlambat beberapa detik

### Hubungan dengan Modul 5

Ini dekat dengan konsep eventual consistency.

---

## 7. Properti P - Partition Tolerance

Partition tolerance berarti sistem tetap berusaha berjalan walaupun terjadi gangguan komunikasi antar-node.

Penyebab partition bisa berupa:

- router atau switch gagal
- kabel atau jalur jaringan bermasalah
- latensi sangat tinggi antar data center
- salah konfigurasi jaringan
- paket data hilang

### Mengapa P Penting?

Karena pada sistem nyata, gangguan jaringan tidak bisa dianggap mustahil. Begitu sistem berjalan di banyak node dan banyak lokasi, partition adalah risiko yang realistis.

Itulah sebabnya banyak pembahasan CAP mengatakan bahwa dalam sistem terdistribusi nyata, P biasanya tidak benar-benar bisa “dipilih untuk diabaikan”.

Artinya:

- kalau sistem Anda memang terdistribusi, Anda harus siap menghadapi partition
- akibatnya, pilihan yang benar-benar dipertimbangkan biasanya adalah CP atau AP

---

## 8. Mengapa Saat Partisi Harus Memilih?

Bayangkan ada tiga node database: A, B, dan C.

Dalam kondisi normal:

- A, B, dan C saling terhubung
- data bisa disinkronkan
- sistem bisa terlihat konsisten dan available sekaligus

Namun saat partisi jaringan terjadi:

- misalnya B tidak bisa berkomunikasi dengan C
- maka sistem tidak lagi punya pandangan data yang benar-benar sama di semua node secara instan

Pada titik ini ada dua pilihan besar:

### Pilihan CP

Sistem menjaga consistency.

Caranya:

- jika tidak bisa memastikan data seragam, sebagian request ditolak atau ditunda

Akibatnya:

- data tetap benar
- tetapi availability menurun

### Pilihan AP

Sistem menjaga availability.

Caranya:

- node tetap melayani request walaupun belum sinkron penuh

Akibatnya:

- layanan tetap responsif
- tetapi data bisa sementara berbeda antar-node

---

## 9. CP, AP, dan CA

### CP - Consistency + Partition Tolerance

Sistem memilih menjaga data tetap seragam saat partisi, walaupun harus menolak sebagian request.

Karakteristik:

- data lebih dapat dipercaya
- cocok untuk transaksi kritis
- availability dikorbankan saat jaringan bermasalah

Contoh yang sering dikaitkan:

- sistem perbankan
- beberapa konfigurasi MongoDB
- HBase

### AP - Availability + Partition Tolerance

Sistem memilih tetap merespons saat partisi, walaupun data bisa sementara tidak sinkron.

Karakteristik:

- layanan tetap aktif
- user tetap mendapat jawaban
- consistency bersifat eventual atau dapat diatur

Contoh yang sering dikaitkan:

- Cassandra
- DynamoDB
- banyak sistem sosial dan analytics

### CA - Consistency + Availability

Secara teori, CA berarti data tetap konsisten dan layanan tetap tersedia.

Tetapi dalam sistem terdistribusi nyata, CA tidak realistis jika partition benar-benar terjadi.

Jadi CA biasanya hanya masuk akal jika:

- sistem tidak benar-benar terdistribusi
- atau kita mengabaikan kemungkinan network partition

Contoh sederhananya adalah database relasional pada satu server.

### Analisis Penting

Kalau dosen bertanya bagian ini, jawaban yang lebih matang adalah:

> Pada praktik sistem terdistribusi, CAP bukan soal memilih dua dari tiga setiap saat, tetapi soal apa yang diprioritaskan ketika partition terjadi.

---

## 10. Analisis Slide Studi Kasus Database

PPT memberi contoh MongoDB, Cassandra, dan Redis. Ini berguna untuk memahami arah umum, tetapi ada satu hal penting.

### Catatan Analitis

Klasifikasi CAP untuk database modern sering bersifat kontekstual, tergantung:

- mode cluster atau standalone
- konfigurasi replication
- quorum read dan write
- apakah sistem memakai leader election
- bagaimana aplikasi memakai database tersebut

Jadi lebih aman menjelaskan seperti ini:

- MongoDB sering diposisikan lebih dekat ke CP pada kondisi tertentu
- Cassandra sering diposisikan lebih dekat ke AP dengan eventual consistency dan tunable consistency
- Redis bisa berbeda tergantung mode dan arsitektur yang digunakan

Jawaban ini lebih kuat daripada sekadar menghafal label tetap.

---

## 11. Analisis Simulasi di PPT

Simulasi tiga node pada PPT sangat bagus untuk menunjukkan inti CAP.

### Kondisi Normal

Saat semua node masih terhubung:

- sistem bisa terlihat konsisten
- sistem juga tetap available

Ini menunjukkan bahwa konflik CAP tidak selalu muncul setiap saat.

### Saat Partisi Terjadi

Begitu satu jalur antar-node putus:

- P menjadi kenyataan yang harus dihadapi
- sistem tidak bisa lagi memastikan C dan A secara penuh bersamaan

Maka:

- mode CP akan menolak sebagian request demi kebenaran data
- mode AP akan tetap menjawab, tetapi data bisa belum sinkron

### Inti Analisis

Inilah inti terdalam dari CAP Theorem:

- selama jaringan normal, banyak sistem tampak baik-baik saja
- saat partisi datang, keputusan desain yang sesungguhnya terlihat

---

## 12. Penerapan Nyata

### Sistem Perbankan

Lebih cocok ke arah CP.

Alasannya:

- saldo harus benar
- transaksi tidak boleh ganda atau salah
- lebih baik request ditunda daripada data salah

### E-Commerce

Bisa campuran CP dan AP.

Contoh:

- katalog produk bisa lebih ke AP
- keranjang bisa agak toleran
- pembayaran dan stok kritis lebih ke CP

Ini sangat penting karena menunjukkan bahwa satu sistem besar tidak harus seluruhnya hanya CP atau hanya AP.

### Media Sosial

Lebih cocok ke arah AP.

Alasannya:

- like atau komentar terlambat beberapa detik biasanya masih dapat diterima
- yang lebih penting adalah layanan tetap responsif

### Sistem Cloud dan Database Modern

Banyak yang menyediakan tunable consistency.

Artinya:

- aplikasi bisa memilih tingkat consistency tertentu
- keputusan bisa disesuaikan dengan SLA dan kebutuhan fitur

Ini selaras dengan materi modul bahwa desain sistem harus menyesuaikan kebutuhan bisnis, bukan memilih satu teori secara kaku.

---

## 13. Analogi yang Paling Mudah

### Analogi Cabang Bank

Bayangkan ada beberapa cabang bank yang menyimpan data saldo yang sama.

#### Consistency

Jika saldo Anda berubah di satu cabang, semua cabang lain harus langsung menunjukkan angka yang sama.

#### Availability

Apa pun yang terjadi, setiap cabang harus tetap melayani nasabah dan memberi jawaban.

#### Partition Tolerance

Walaupun jalur komunikasi antar cabang terputus, sistem tetap harus memutuskan bagaimana bersikap.

### Saat Jaringan Antar-Cabang Putus

Kalau memilih CP:

- sebagian cabang mungkin menolak transaksi sementara
- tujuannya agar saldo tidak salah

Kalau memilih AP:

- semua cabang tetap melayani
- tetapi saldo yang terlihat bisa belum sama untuk sementara

### Analogi Satu Kalimat

- CP = lebih baik diam sebentar daripada memberi data salah
- AP = lebih baik tetap menjawab walaupun data mungkin belum paling baru

---

## 14. Analogi Kedua - Grup Admin Gudang

Bayangkan ada tiga admin gudang di kota berbeda yang mencatat stok barang yang sama.

- Consistency = semua admin harus melihat angka stok yang sama
- Availability = setiap admin harus bisa langsung menjawab saat ditanya stok
- Partition tolerance = walaupun grup chat antar-admin bermasalah, operasional harus tetap lanjut

Saat grup chat putus:

- kalau memilih CP, admin berhenti update sampai data bisa dicocokkan lagi
- kalau memilih AP, admin tetap menjawab berdasarkan data lokal, walaupun mungkin belum sinkron

Analogi ini cocok untuk menjelaskan e-commerce dan sistem inventori.

---

## 15. Kalimat Hafalan Cepat

CAP Theorem menjelaskan bahwa pada sistem terdistribusi, ketika terjadi network partition, sistem harus memilih untuk lebih memprioritaskan consistency atau availability. Jika memilih CP, data tetap benar tetapi sebagian request bisa ditolak. Jika memilih AP, layanan tetap merespons tetapi data bisa sementara belum sinkron. Karena itu, pilihan arsitektur harus disesuaikan dengan kebutuhan bisnis dan toleransi risiko aplikasi.

---

## 16. Jawaban Siap Pakai Saat Ditanya

### Apa itu CAP Theorem?

CAP Theorem adalah prinsip yang menjelaskan trade-off pada sistem terdistribusi antara consistency, availability, dan partition tolerance.

### Apa arti Consistency?

Consistency berarti semua node menampilkan data terbaru yang sama setelah write berhasil.

### Apa arti Availability?

Availability berarti setiap request yang masuk ke node yang aktif tetap mendapatkan respons.

### Apa arti Partition Tolerance?

Partition tolerance berarti sistem tetap beroperasi walaupun komunikasi antar-node terganggu.

### Mengapa partition dianggap penting?

Karena pada sistem terdistribusi nyata, gangguan jaringan adalah kemungkinan yang realistis dan tidak bisa diabaikan.

### Apa itu CP?

CP adalah pilihan untuk menjaga consistency dan partition tolerance, walaupun availability bisa turun saat partisi.

### Apa itu AP?

AP adalah pilihan untuk menjaga availability dan partition tolerance, walaupun consistency sementara bisa menurun.

### Apakah CA mungkin?

CA hanya realistis jika tidak ada partition, sehingga biasanya lebih cocok untuk sistem yang tidak benar-benar terdistribusi.

### Apakah CAP berarti sistem harus selalu memilih dua dari tiga?

Tidak secara mutlak setiap saat. Inti CAP muncul saat network partition terjadi. Pada kondisi normal, sistem bisa terlihat konsisten dan available sekaligus.

### Sistem apa yang cocok memilih CP?

Sistem perbankan, pembayaran, atau transaksi kritis yang tidak boleh salah.

### Sistem apa yang cocok memilih AP?

Media sosial, analytics, atau layanan yang lebih mementingkan respons cepat dan tetap aktif.

### Apakah satu aplikasi bisa gabungan CP dan AP?

Bisa. Banyak sistem modern memakai CP untuk jalur kritis dan AP untuk jalur yang lebih toleran terhadap keterlambatan.

---

## 17. Kesimpulan

PPT ini ingin menegaskan bahwa CAP Theorem adalah dasar berpikir dalam merancang sistem terdistribusi. Intinya bukan mencari sistem yang sempurna, tetapi memahami kompromi yang harus diambil saat jaringan tidak berjalan normal.

- Consistency menekankan kebenaran data
- Availability menekankan layanan tetap aktif
- Partition tolerance menekankan kemampuan bertahan saat komunikasi antar-node terganggu

Saat partisi terjadi, sistem harus memilih prioritas. Karena itu, keputusan CP atau AP tidak boleh dibuat sembarang, tetapi harus mengikuti kebutuhan aplikasi, risiko bisnis, dan toleransi terhadap data yang terlambat atau request yang ditolak.